-- CANDIDATE ONLY. Derived current political-capital pages, not capital issuance.
-- Requires postwar-captain-source-publication.sql and the complete mixed
-- current projection schema. No role, membership, economic posting or default.
begin;
grant create on schema world_v2 to world_v2_captain_source_owner,world_v2_postwar_projection_owner;
-- The projection owner receives a fixed small original, never table access.
create function world_v2.postwar_captain_projection_original(p_world text,p_country text,p_fp text,p_admission text)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare r world_v2.captain_source_publication_registry%rowtype;a world_v2.captain_operating_source_adoption%rowtype;j jsonb;originals jsonb;begin
 select * into r from world_v2.captain_source_publication_registry x where x.world_id=p_world and x.country_id=p_country and x.seed_fingerprint=p_fp and x.world_admission_ref=p_admission;
 if not found or octet_length(r.packet_text)>65536 or r.packet_sha256<>encode(sha256(convert_to(r.packet_text,'UTF8')),'hex')then raise exception 'CAPTAIN_CURRENT_ADOPTED_ORIGINAL_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.captain_operating_source_adoption x where x.adoption_ref=r.adoption_ref and x.world_id=p_world and x.country_id=p_country and x.seed_fingerprint=p_fp;
 if not found then raise exception 'CAPTAIN_CURRENT_PUBLISHED_ADOPTION_REQUIRED'using errcode='55000';end if;
 j:=r.packet_text::jsonb;
 select jsonb_object_agg(o.fact_ref,o.original_text)into originals from world_v2.captain_operating_original o where o.adoption_ref=r.adoption_ref and o.original_sha256=encode(sha256(convert_to(o.original_text,'UTF8')),'hex');
 if j->>'schemaVersion'is distinct from 'postwar-captain-source-publication-v1'or j->'originalTexts'is distinct from originals or j->'adoption'->>'worldId'is distinct from p_world or j->'adoption'->>'countryId'is distinct from p_country or j->'adoption'->>'seedFingerprint'is distinct from p_fp or j->'adoption'->>'worldAdmissionRef'is distinct from p_admission or j->'adoption'->>'issuerRef'is distinct from a.issuer_ref or j->'adoption'->>'custodianRef'is distinct from a.custodian_ref or j->'adoption'->>'admissionRef'is distinct from a.admission_ref or j->'adoption'->>'admissionRevision'is distinct from a.admission_revision or j->'adoption'->>'originalAdmissionEvidenceSha256'is distinct from a.original_admission_evidence_sha256 then raise exception 'CAPTAIN_CURRENT_EXACT_ORIGINAL_REQUIRED'using errcode='23514';end if;
 return j||jsonb_build_object('packetSha256',r.packet_sha256);
end;$$;
create function world_v2.postwar_captain_projection_current_original(p_world text,p_country text,p_fp text,p_admission text)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare ref text;begin
 select x.adoption_ref into ref from world_v2.captain_operating_source_adoption x where x.world_id=p_world and x.country_id=p_country and x.seed_fingerprint=p_fp for share;
 if not found or exists(select 1 from world_v2.captain_operating_source_revocation x where x.adoption_ref=ref)then raise exception 'CAPTAIN_CURRENT_SOURCE_REVOKED_OR_MISSING'using errcode='55000';end if;
 return world_v2.postwar_captain_projection_original(p_world,p_country,p_fp,p_admission);
end;$$;
alter function world_v2.postwar_captain_projection_original(text,text,text,text)owner to world_v2_captain_source_owner;
alter function world_v2.postwar_captain_projection_current_original(text,text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.postwar_captain_projection_original(text,text,text,text),world_v2.postwar_captain_projection_current_original(text,text,text,text)from public;
grant execute on function world_v2.postwar_captain_projection_original(text,text,text,text),world_v2.postwar_captain_projection_current_original(text,text,text,text)to world_v2_postwar_projection_owner;
create function world_v2.postwar_captain_quantity(p_value jsonb)returns numeric
language plpgsql immutable set search_path=pg_catalog as $$begin
 if jsonb_typeof(p_value)is distinct from 'object'or(select count(*)from jsonb_object_keys(p_value))<>2 or p_value->>'unit'is distinct from 'political_capital'or p_value->>'amount'is null or length(p_value->>'amount')>256 or(p_value->>'amount')!~'^(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'then raise exception 'CAPTAIN_CURRENT_CANONICAL_QUANTITY_REQUIRED'using errcode='23514';end if;
 return(p_value->>'amount')::numeric;
end;$$;
create function world_v2.postwar_captain_capital(p_value jsonb,p_country text)returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare key text;opening numeric;generated numeric;total numeric;available numeric;spent numeric;closing numeric;buckets numeric:=0;entry jsonb;n integer:=0;names text[]:=array['FISCAL_REFORM','INDUSTRIAL_STRATEGY','TRADE_NEGOTIATIONS','SOCIAL_REFORM_PROTECTION','STRATEGIC_PROJECT_SUPPORT','CRISIS_RESPONSE','UNALLOCATED_CRISIS_RESERVE'];begin
 if jsonb_typeof(p_value)is distinct from 'object'or(select count(*)from jsonb_object_keys(p_value))<>9 or p_value->>'countryRef'is distinct from p_country or p_value->>'capitalRef'is null or p_value->>'capitalRef'!~'^[A-Za-z][A-Za-z0-9._:-]{0,127}$'or jsonb_typeof(p_value->'buckets')is distinct from 'array'or jsonb_array_length(p_value->'buckets')<>7 then raise exception 'CAPTAIN_CURRENT_EXACT_CAPITAL_REQUIRED'using errcode='23514';end if;
 foreach key in array array['opening','generated','total','available','spent','closing']loop perform world_v2.postwar_captain_quantity(p_value->key);end loop;
 opening:=(p_value->'opening'->>'amount')::numeric;generated:=(p_value->'generated'->>'amount')::numeric;total:=(p_value->'total'->>'amount')::numeric;available:=(p_value->'available'->>'amount')::numeric;spent:=(p_value->'spent'->>'amount')::numeric;closing:=(p_value->'closing'->>'amount')::numeric;
 for entry in select value from jsonb_array_elements(p_value->'buckets')loop n:=n+1;if jsonb_typeof(entry)is distinct from 'object'or(select count(*)from jsonb_object_keys(entry))<>2 or entry->>'bucket'is distinct from names[n]then raise exception 'CAPTAIN_CURRENT_SEVEN_EXACT_BUCKETS_REQUIRED'using errcode='23514';end if;buckets:=buckets+world_v2.postwar_captain_quantity(entry->'balance');end loop;
 if opening+generated<>total or available+spent<>total or available<>closing or buckets<>closing then raise exception 'CAPTAIN_CURRENT_CAPITAL_CONSERVATION_REQUIRED'using errcode='23514';end if;return p_value;
end;$$;
-- One explicit existing Core allocation, independently recomputed from the
-- immutable registered original and all preceding allocations. No family skip.
create function world_v2.postwar_mixed_captain_group(p_world text,p_command jsonb,p_event jsonb,p_prior jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a record;packet jsonb;genesis jsonb;original jsonb;reason jsonb;intent jsonb;ep jsonb;source jsonb;trace jsonb;capital jsonb;after_capital jsonb;entries jsonb:='[]';entry jsonb;from_entry jsonb;to_entry jsonb;delta numeric;new_balance numeric;quantity jsonb;transitions jsonb:='[]';refs jsonb;action text;req jsonb;request_fact jsonb;capital_fact jsonb;proof jsonb;output jsonb;source_hash text;f text;direction text;before_entry jsonb;after_entry jsonb;begin
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 packet:=world_v2.postwar_captain_projection_original(p_world,p_command->>'countryId',a.seed_fingerprint,a.admission_ref);genesis:=(packet->'genesis'->>'canonicalPayload')::jsonb;
 if genesis->>'schemaVersion'is distinct from 'captain-operating-genesis-v1'or genesis->>'worldId'is distinct from p_world or genesis->>'countryId'is distinct from p_command->>'countryId'or genesis->>'seedId'is distinct from a.seed_id or genesis->>'seedFingerprint'is distinct from a.seed_fingerprint then raise exception 'CAPTAIN_CURRENT_EXACT_GENESIS_REQUIRED'using errcode='23514';end if;
 capital:=world_v2.postwar_captain_capital(coalesce(p_prior,genesis->'capital'),p_command->>'countryId');
 intent:=(p_command->>'canonicalPayload')::jsonb;ep:=(p_event->>'canonicalPayload')::jsonb;source:=ep->'source';trace:=source->'trace';capital_fact:=source->'capitalFact';
 if p_command->>'officeId'is distinct from 'CAPTAIN'or p_command->>'commandType'is distinct from 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'or p_event->>'eventType'is distinct from 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1'or ep->>'schemaVersion'is distinct from 'captain-political-capital-event-v1'or ep->>'commandFingerprint'is distinct from p_command->>'fingerprint'or ep->'command'is distinct from(p_command-'canonicalPayload'-'fingerprint'-'payloadHash')||jsonb_build_object('payload',intent)or intent->>'schemaVersion'is distinct from 'captain-political-capital-allocation-v1'or(select count(*)from jsonb_object_keys(intent))<>5 or intent->>'fromBucket'is not distinct from intent->>'toBucket'or source->>'worldId'is distinct from p_world or source->>'countryId'is distinct from p_command->>'countryId'or source->>'worldVersion'is distinct from p_command->>'expectedWorldVersion'or(source->>'lastEventSequence')::numeric is distinct from(p_event->>'sequence')::numeric-1 or capital_fact->'payload'is distinct from capital or capital_fact->>'sourceRef'is distinct from packet->'genesis'->>'sourceRef' then raise exception 'CAPTAIN_CURRENT_EXACT_COMMAND_SOURCE_REQUIRED'using errcode='23514';end if;
 select x into original from jsonb_array_elements(packet->'reasons')x where x->>'factRef'=intent->>'reasonFactRef';
 if original is null then raise exception 'CAPTAIN_CURRENT_ACTUAL_REASON_REQUIRED'using errcode='23514';end if;reason:=(original->>'canonicalPayload')::jsonb;
 if reason->>'schemaVersion'is distinct from 'captain-operating-reason-v1'or reason->>'worldId'is distinct from p_world or reason->>'countryId'is distinct from p_command->>'countryId'or source->'reasonFact'->>'factRef'is distinct from original->>'factRef'or source->'reasonFact'->>'sourceRef'is distinct from original->>'sourceRef'or source->'reasonFact'->'predecessorFactRefs'is distinct from original->'predecessorFactRefs'or source->'reasonFact'->'payload'is distinct from reason->'reason' then raise exception 'CAPTAIN_CURRENT_REASON_ORIGINAL_DIFFERS'using errcode='23514';end if;
 for entry in select value from jsonb_array_elements(jsonb_build_array(packet->'genesis',original))loop
 if entry->>'payloadSHA256'is distinct from encode(sha256(convert_to(entry->>'canonicalPayload','UTF8')),'hex')or(p_command->>'simTime')::numeric<(entry->>'effectiveFromSimTime')::numeric or(entry->'effectiveUntilSimTime'<>'null'::jsonb and(p_command->>'simTime')::numeric>=(entry->>'effectiveUntilSimTime')::numeric)then raise exception 'CAPTAIN_CURRENT_ORIGINAL_NOT_EFFECTIVE'using errcode='23514';end if;end loop;
 if trace->'snapshot'->>'lineageRef'is distinct from p_world or trace->'snapshot'->>'sourceVersion'is distinct from 'WORLD_VERSION_'||(p_command->>'expectedWorldVersion')or trace->'snapshotAt'is distinct from jsonb_build_object('amount',p_command->>'simTime','unit','sim_millisecond')or trace->>'calculationVersion'is distinct from genesis->>'semanticRevision'then raise exception 'CAPTAIN_CURRENT_SOURCE_TRACE_REQUIRED'using errcode='23514';end if;
 source_hash:=encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(jsonb_build_object('worldId',p_world,'countryId',p_command->>'countryId','worldVersion',source->>'worldVersion','lastEventSequence',source->>'lastEventSequence','capital',capital_fact-'snapshot'-'observedAt'-'canonicalPayload','reason',(source->'reasonFact')-'snapshot'-'observedAt'-'canonicalPayload')),'UTF8')),'hex');
 if trace->'snapshot'->>'snapshotHash'is distinct from source_hash then raise exception 'CAPTAIN_CURRENT_SOURCE_HASH_INVALID'using errcode='23514';end if;
 for entry in select value from jsonb_array_elements(jsonb_build_array(capital_fact,source->'reasonFact'))loop if entry->'snapshot'is distinct from trace->'snapshot'or entry->'observedAt'is distinct from trace->'snapshotAt'or entry->>'canonicalPayload'is distinct from world_v2.canonical_json(entry->'payload')then raise exception 'CAPTAIN_CURRENT_FACT_TRACE_INVALID'using errcode='23514';end if;end loop;
 delta:=world_v2.postwar_captain_quantity(intent->'amount');if delta<=0 then raise exception 'CAPTAIN_CURRENT_POSITIVE_ALLOCATION_REQUIRED'using errcode='23514';end if;
 select x into from_entry from jsonb_array_elements(capital->'buckets')x where x->>'bucket'=intent->>'fromBucket';select x into to_entry from jsonb_array_elements(capital->'buckets')x where x->>'bucket'=intent->>'toBucket';
 if from_entry is null or to_entry is null or(from_entry->'balance'->>'amount')::numeric<delta then raise exception 'CAPTAIN_CURRENT_BUCKET_CAPACITY_REQUIRED'using errcode='23514';end if;
 for entry in select value from jsonb_array_elements(capital->'buckets')loop
  new_balance:=(entry->'balance'->>'amount')::numeric+case entry->>'bucket'when intent->>'fromBucket'then-delta when intent->>'toBucket'then delta else 0 end;
  entries:=entries||jsonb_build_array(jsonb_build_object('bucket',entry->>'bucket','balance',jsonb_build_object('amount',trim_scale(new_balance)::text,'unit','political_capital')));
 end loop;
 after_capital:=world_v2.postwar_captain_capital(jsonb_set(capital,'{buckets}',entries),p_command->>'countryId');action:='ALLOCATION.'||(p_command->>'commandId');refs:=jsonb_build_array(capital_fact->>'factRef','REQUEST.'||(p_command->>'commandId'));
 foreach direction in array array['from','to']loop
  before_entry:=case direction when'from'then from_entry else to_entry end;select x into after_entry from jsonb_array_elements(entries)x where x->>'bucket'=before_entry->>'bucket';
  transitions:=transitions||jsonb_build_array(jsonb_build_object('transitionRef',action||'.'||direction,'inputRefs',refs,'outputRef',action||'.'||direction||'.after','before',before_entry->'balance','delta',jsonb_build_object('amount',trim_scale(case direction when'from'then-delta else delta end)::text,'unit','political_capital'),'after',after_entry->'balance'));
 end loop;
 if ep->'capitalAfter'is distinct from after_capital or ep->'transitions'is distinct from transitions then raise exception 'CAPTAIN_CURRENT_CORE_ALLOCATION_DIFFERS'using errcode='23514';end if;
 req:=jsonb_build_object('allocationRef',action,'countryRef',p_command->>'countryId','fromBucket',intent->>'fromBucket','toBucket',intent->>'toBucket','amount',intent->'amount','reasonFactRef',intent->>'reasonFactRef','effectiveAt',trace->'snapshotAt');
 request_fact:=jsonb_build_object('factRef','REQUEST.'||(p_command->>'commandId'),'sourceRef','COMMAND.'||(p_command->>'commandId'),'predecessorFactRefs',jsonb_build_array(capital_fact->>'factRef',source->'reasonFact'->>'factRef'),'snapshot',trace->'snapshot','observedAt',trace->'snapshotAt','canonicalPayload',world_v2.canonical_json(req));
 output:=jsonb_build_object('capital',after_capital,'allocation',jsonb_build_object('allocationRef',action,'fromBucket',intent->>'fromBucket','toBucket',intent->>'toBucket','amount',intent->'amount','reasonFactRef',intent->>'reasonFactRef'));
 proof:=jsonb_build_object('module','V24_1_POLITICAL_CAPITAL_ALLOCATION','traceRef',trace->>'traceRef','calculationVersion',trace->>'calculationVersion','snapshot',trace->'snapshot','snapshotAt',trace->'snapshotAt','inputFactRefs',refs,'inputFacts',jsonb_build_array(capital_fact-'payload',request_fact),'outputRef',action||'.result','outputCanonical',world_v2.canonical_json(output),'transitions',transitions);
 if ep->>'preparationHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(proof),'UTF8')),'hex')then raise exception 'CAPTAIN_CURRENT_PREPARATION_HASH_INVALID'using errcode='23514';end if;
 return after_capital;
end;$$;
alter function world_v2.postwar_captain_quantity(jsonb)owner to world_v2_postwar_projection_owner;
alter function world_v2.postwar_captain_capital(jsonb,text)owner to world_v2_postwar_projection_owner;
alter function world_v2.postwar_mixed_captain_group(text,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_captain_quantity(jsonb),world_v2.postwar_captain_capital(jsonb,text),world_v2.postwar_mixed_captain_group(text,jsonb,jsonb,jsonb)from public;
-- Reuse the already independently validated complete prefix. This local fold
-- is only its Captain country state; no foreign frame is removed or rebased.
create function world_v2.postwar_captain_current_capital(p_world text,p_country text,p_packet jsonb)returns table(capital jsonb,origin_world_version bigint,origin_event_sequence bigint)
language plpgsql security definer set search_path=pg_catalog as $$
declare c record;e record;command jsonb;event jsonb;begin
 capital:=world_v2.postwar_captain_capital((p_packet->'genesis'->>'canonicalPayload')::jsonb->'capital',p_country);origin_world_version:=0;origin_event_sequence:=0;
 for e in select x.* from world_v2.authoritative_event x join world_v2.command_submission s on s.world_id=x.world_id and s.command_id=x.causation_command_id where x.world_id=p_world and s.country_id=p_country and s.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'order by x.event_sequence loop
  select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.command_id=e.causation_command_id;
  command:=jsonb_build_object('actorId',c.actor_id,'authSubject',c.auth_subject::text,'commandId',c.command_id,'commandType',c.command_type,'correlationId',c.correlation_id,'countryId',c.country_id,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'officeId',c.office_id,'canonicalPayload',c.canonical_payload,'schemaVersion',c.schema_version,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'worldId',p_world,'fingerprint',c.command_fingerprint,'payloadHash',c.payload_sha256);
  event:=jsonb_build_object('canonicalPayload',e.canonical_payload,'eventType',e.event_type,'sequence',e.event_sequence::text);
  capital:=world_v2.postwar_mixed_captain_group(p_world,command,event,capital);origin_world_version:=e.world_version;origin_event_sequence:=e.event_sequence;
 end loop;return next;
end;$$;
alter function world_v2.postwar_captain_current_capital(text,text,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_captain_current_capital(text,text,jsonb)from public;
create table world_v2.postwar_captain_current_document(
 document_ref text primary key,world_id text not null,country_id text not null,world_version bigint not null check(world_version>0),event_sequence bigint not null check(event_sequence>0),
 seed_fingerprint text not null,admission_ref text not null,adoption_ref text not null,source_version text not null unique,source_revision text not null,
 origin_world_version bigint not null,origin_event_sequence bigint not null,coverage jsonb not null,source_pointer jsonb not null,
 rows_text text not null check(octet_length(rows_text)<=48000 and jsonb_array_length(rows_text::jsonb)=7),
 rows_sha256 text not null check(rows_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),
 unique(world_id,country_id,world_version,event_sequence),foreign key(adoption_ref)references world_v2.captain_operating_source_adoption(adoption_ref)
);
alter table world_v2.postwar_captain_current_document owner to world_v2_postwar_projection_owner;
alter table world_v2.postwar_captain_current_document enable row level security;
alter table world_v2.postwar_captain_current_document force row level security;
revoke all on world_v2.postwar_captain_current_document from public,world_v2_postwar_projection_reader,world_v2_postwar_projection_publisher;
create policy captain_current_owner on world_v2.postwar_captain_current_document to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true))with check(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true));
create policy captain_current_world on world_v2.postwar_captain_current_document as restrictive to world_v2_postwar_projection_owner using(world_id=current_setting('econmind.postwar_projection_world',true));
create trigger captain_current_immutable before update or delete on world_v2.postwar_captain_current_document for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger captain_current_no_truncate before truncate on world_v2.postwar_captain_current_document for each statement execute function world_v2.reject_authoritative_history_mutation();
create function world_v2.publish_postwar_captain_current(p_world text,p_country text,p_assertion text)
returns setof world_v2.postwar_captain_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;prefix record;state record;packet jsonb;assertion jsonb;rows jsonb;coverage jsonb;pointer jsonb;ref text;version text;state_hash text;rows_hash text;coverage_ref text;d world_v2.postwar_captain_current_document%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'CAPTAIN_CURRENT_FIXED_SEPARATE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_world is null or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_assertion is null or octet_length(p_assertion)>16384 then raise exception 'CAPTAIN_CURRENT_BOUNDED_SCOPE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select x.world_version,x.event_sequence into strict h from world_v2.world_head x where x.world_id=p_world for share;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 packet:=world_v2.postwar_captain_projection_current_original(p_world,p_country,a.seed_fingerprint,a.admission_ref);
 select * into strict prefix from world_v2.postwar_mixed_current_prefix(p_world);
 select * into strict state from world_v2.postwar_captain_current_capital(p_world,p_country,packet);
 assertion:=p_assertion::jsonb;
 state_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(state.capital),'UTF8')),'hex');
 select jsonb_agg(jsonb_build_object('schemaVersion','postwar-captain-political-capital-row-v1','countryId',p_country,'capitalRef',state.capital->>'capitalRef','bucket',x->>'bucket','unit','political_capital','balance',x->'balance'->>'amount','opening',state.capital->'opening'->>'amount','generated',state.capital->'generated'->>'amount','total',state.capital->'total'->>'amount','available',state.capital->'available'->>'amount','spent',state.capital->'spent'->>'amount','closing',state.capital->'closing'->>'amount','allocationNature','REALLOCATION_NOT_GENERATION_OR_SPENDING')order by n)into rows from jsonb_array_elements(state.capital->'buckets')with ordinality q(x,n);
 rows_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(rows),'UTF8')),'hex');
 if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint)or assertion->>'capitalStateHash'is distinct from state_hash or assertion->>'rowsHash'is distinct from rows_hash then raise exception 'CAPTAIN_CURRENT_CORE_SQL_STATE_OR_PREFIX_MISMATCH'using errcode='23514';end if;
 coverage_ref:='POSTWAR_CAPTAIN_CURRENT_COVERAGE_'||upper(encode(sha256(convert_to(p_assertion||p_country,'UTF8')),'hex'));
 coverage:=assertion->'coverage'||jsonb_build_object('schemaVersion','postwar-captain-current-prefix-coverage-v1','reducerVersion','POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1','countryId',p_country,'coverageRef',coverage_ref,'globalWorldVersion',h.world_version::text,'globalEventSequence',h.event_sequence::text,'capitalStateHash',state_hash,'originalPacketSha256',packet->>'packetSha256','originWorldVersion',state.origin_world_version::text,'originEventSequence',state.origin_event_sequence::text);
 pointer:=jsonb_build_object('table','captain_operating_original','adoptionRef',packet->'adoption'->>'adoptionRef','genesisFactRef',packet->'genesis'->>'factRef','genesisPayloadSha256',packet->'genesis'->>'payloadSHA256','originalAdmissionEvidenceSha256',packet->'adoption'->>'originalAdmissionEvidenceSha256','currentDerivation','COMPLETE_FINANCE_SOCIAL_FX_CAPTAIN_PREFIX','capitalStateHash',state_hash);
 ref:='POSTWAR_CAPTAIN_CURRENT_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,a.seed_fingerprint,a.admission_ref,h.world_version::text,h.event_sequence::text,coverage,rows,pointer)),'UTF8')),'hex'));version:='sha256:'||encode(sha256(convert_to(ref||rows_hash,'UTF8')),'hex');
 insert into world_v2.postwar_captain_current_document values(ref,p_world,p_country,h.world_version,h.event_sequence,a.seed_fingerprint,a.admission_ref,packet->'adoption'->>'adoptionRef',version,packet->'genesis'->>'revision',state.origin_world_version,state.origin_event_sequence,coverage,pointer,rows::text,encode(sha256(convert_to(rows::text,'UTF8')),'hex'))on conflict(world_id,country_id,world_version,event_sequence)do nothing;
 select * into strict d from world_v2.postwar_captain_current_document x where x.world_id=p_world and x.country_id=p_country and x.world_version=h.world_version and x.event_sequence=h.event_sequence;
 if d.document_ref<>ref then raise exception 'CAPTAIN_CURRENT_IMMUTABLE_CONFLICT'using errcode='23514';end if;return next d;
end;$$;
alter function world_v2.publish_postwar_captain_current(text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_captain_current(text,text,text)from public;
grant execute on function world_v2.publish_postwar_captain_current(text,text,text)to world_v2_postwar_projection_publisher;
-- Read-only original currentness check: a read-only request cannot use FOR SHARE.
create function world_v2.postwar_captain_projection_readable_original(p_world text,p_country text,p_fp text,p_admission text)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare ref text;begin
 select x.adoption_ref into ref from world_v2.captain_operating_source_adoption x where x.world_id=p_world and x.country_id=p_country and x.seed_fingerprint=p_fp;
 if not found or exists(select 1 from world_v2.captain_operating_source_revocation x where x.adoption_ref=ref)then return null;end if;
 return world_v2.postwar_captain_projection_original(p_world,p_country,p_fp,p_admission);
end;$$;
alter function world_v2.postwar_captain_projection_readable_original(text,text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.postwar_captain_projection_readable_original(text,text,text,text)from public;
grant execute on function world_v2.postwar_captain_projection_readable_original(text,text,text,text)to world_v2_postwar_projection_owner;
create function world_v2.read_postwar_captain_current_page(p_world text,p_offset integer,p_limit integer,p_expected text default null)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;d world_v2.postwar_captain_current_document%rowtype;original jsonb;selected jsonb;returned integer;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')then raise exception 'CAPTAIN_CURRENT_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id='CAPTAIN';
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_captain_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref;
 if not found then if p_expected is not null and exists(select 1 from world_v2.postwar_captain_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.source_version=p_expected)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';else return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';end if;return;end if;
 if p_expected is not null and p_expected<>d.source_version then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 original:=world_v2.postwar_captain_projection_readable_original(p_world,s.country_id,s.seed_fingerprint,s.admission_ref);
 if original is null or d.coverage->>'originalPacketSha256'is distinct from original->>'packetSha256'or d.rows_sha256<>encode(sha256(convert_to(d.rows_text,'UTF8')),'hex')or d.coverage->>'globalWorldVersion'is distinct from s.world_version or d.coverage->>'globalEventSequence'is distinct from s.event_sequence or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.event_id=d.coverage->>'coveredThroughEventId'and e.event_fingerprint=d.coverage->>'coveredThroughEventFingerprint'and e.world_version=d.world_version and e.event_sequence=d.event_sequence)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select coalesce(jsonb_agg(x order by n),'[]')into selected from jsonb_array_elements(d.rows_text::jsonb)with ordinality q(x,n)where n>p_offset and n<=p_offset+p_limit;returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature','ADMITTED_CURRENT_POLITICAL_CAPITAL_MIXED_PREFIX','sourceVersion',d.source_version,'sourceRevision',d.source_revision,'seedId',s.seed_id,'seedFingerprint',s.seed_fingerprint,'admissionRef',s.admission_ref,'modelVersion',s.model_version,'replayBinding',s.replay_binding,'sourceBundleSha256',s.source_bundle_sha256,'canonicalSeedSha256',s.canonical_seed_sha256,'worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text,'originWorldVersion',d.origin_world_version::text,'originEventSequence',d.origin_event_sequence::text,'observedHead',jsonb_build_object('worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text),'currentCaptainCoverage',d.coverage,'pageHash',d.rows_sha256,'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',7,'nextOffset',case when p_offset+returned<7 then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_captain_current_page(text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_captain_current_page(text,integer,integer,text)from public;
grant execute on function world_v2.read_postwar_captain_current_page(text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_captain_source_owner,world_v2_postwar_projection_owner;
commit;
