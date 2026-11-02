-- Controlled mixed-prefix extension. Old last-PLAN-only publisher is unchanged.
-- Depends on social-operating-custody.sql, social-operating-match-publisher.sql,
-- and postwar-day-one-fx-custody.sql. No UI projection/cache is required.
-- Core full replay occurs under source/H locks in the fixed TS publisher and
-- again in the mandatory automatic consumer. This function independently binds
-- all supplied evidence to the COMPLETE immutable SQL prefix; it never admits
-- a source or accepts a caller READY/permission assertion.
begin;
grant create on schema world_v2 to world_v2_social_source_owner;
grant select on world_v2.financial_posting_batch,world_v2.inventory_posting,world_v2.postwar_day_one_fx_quote_original,world_v2.postwar_day_one_fx_source_original to world_v2_social_source_owner;
do $$declare t text;begin
 foreach t in array array['authoritative_event','command_submission','command_receipt','command_queue','financial_posting_batch','inventory_posting','postwar_day_one_fx_quote_original','postwar_day_one_fx_source_original']loop
  execute format('create policy mixed_match_owner_read on world_v2.%I for select to world_v2_social_source_owner using(current_user=''world_v2_social_source_owner''and world_id=current_setting(''econmind.social_custody_world'',true))',t);
  execute format('create policy mixed_match_owner_read_fence on world_v2.%I as restrictive for select to world_v2_social_source_owner using(current_user=''world_v2_social_source_owner''and world_id=current_setting(''econmind.social_custody_world'',true))',t);
 end loop;
 foreach t in array array['command_submission','command_queue']loop
  execute format('create policy mixed_match_owner_insert on world_v2.%I for insert to world_v2_social_source_owner with check(current_user=''world_v2_social_source_owner''and world_id=current_setting(''econmind.social_custody_world'',true))',t);
  execute format('create policy mixed_match_owner_insert_fence on world_v2.%I as restrictive for insert to world_v2_social_source_owner with check(current_user=''world_v2_social_source_owner''and world_id=current_setting(''econmind.social_custody_world'',true))',t);
 end loop;
end;$$;
create function world_v2.publish_social_operating_mixed_match_due(p_world text,p_country text,p_plan text,p_witness text)
returns world_v2.command_submission language plpgsql security definer set search_path=pg_catalog as $$
declare h world_v2.world_head%rowtype;a world_v2.runtime_opening_admission%rowtype;bound world_v2.social_operating_source_registration%rowtype;g world_v2.social_operating_match_publisher%rowtype;p world_v2.command_submission%rowtype;pr world_v2.command_receipt%rowtype;old world_v2.social_operating_match_publication%rowtype;v world_v2.command_submission%rowtype;
 w jsonb;f jsonb;c world_v2.command_submission%rowtype;r world_v2.command_receipt%rowtype;e world_v2.authoritative_event%rowtype;br world_v2.financial_posting_batch%rowtype;cmd jsonb;ev jsonb;evs jsonb;tr jsonb;rec jsonb;bs jsonb;bp jsonb;q jsonb;intent jsonb;payload jsonb;payload_text text;id text;fp text;published timestamptz;wv bigint:=0;seq bigint:=0;idx bigint;expected_count bigint;expected_type text;frame_count bigint:=0;batch_count bigint:=0;leg_count bigint;prior_sim bigint:=0;byte_count bigint:=0;
begin
 if current_setting('role')<>'world_v2_social_source_publisher'and session_user<>'world_v2_social_source_publisher'then raise exception 'SOCIAL_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if pg_has_role((case when current_setting('role')='none'then session_user else current_setting('role')::name end),'world_v2_social_source_owner','MEMBER')then raise exception 'SOCIAL_OWNER_MEMBERSHIP_REFUSED'using errcode='42501';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country is null or p_witness is null or octet_length(p_witness)>4194304 then raise exception 'MIXED_MATCH_BOUNDED_SCOPE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.social_custody_world',p_world,true);
 select * into strict h from world_v2.world_head x where x.world_id=p_world for share;
 a:=world_v2.social_source_admission(p_world);
 select * into strict bound from world_v2.social_operating_source_registration x where x.world_id=p_world and x.country_id=p_country for share;
 select * into strict g from world_v2.social_operating_match_publisher x where x.world_id=p_world and x.country_id=p_country for share;
 if bound.seed_fingerprint<>a.seed_fingerprint or bound.admission_ref<>a.admission_ref or g.registration_ref<>bound.registration_ref or g.admission_ref<>a.admission_ref or g.issuer_role<>'world_v2_social_source_publisher'or g.rule_version<>'SOCIAL_JOB_MATCH_RULE_V1'or g.valid_from_day<>0 or g.valid_until_day<>1 or exists(select 1 from world_v2.social_operating_source_revocation x where x.registration_ref=bound.registration_ref)or exists(select 1 from world_v2.social_operating_match_publisher_revocation x where x.grant_ref=g.grant_ref)then raise exception 'MIXED_MATCH_CURRENT_SOURCE_OR_PUBLISHER_REQUIRED'using errcode='55000';end if;
 w:=p_witness::jsonb;
 if p_witness<>world_v2.canonical_json(w)or w->>'schemaVersion'is distinct from 'postwar-mixed-match-publication-v1'or w->'head'->>'worldId'is distinct from p_world or w->'head'->>'worldVersion'is distinct from h.world_version::text or w->'head'->>'eventSequence'is distinct from h.event_sequence::text or w->'seedPins'->>'worldId'is distinct from p_world or w->'seedPins'->>'seedId'is distinct from a.seed_id or w->'seedPins'->>'seedFingerprint'is distinct from a.seed_fingerprint or w->'seedPins'->>'admissionRef'is distinct from a.admission_ref or jsonb_typeof(w->'frames')is distinct from 'array'or h.world_version<1 or h.world_version>256 or h.event_sequence>256 then raise exception 'MIXED_MATCH_ACTUAL_HEAD_SOURCE_WITNESS_REQUIRED'using errcode='55000';end if;
 if (select count(*)from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED')<>h.world_version or(select count(*)from world_v2.authoritative_event x where x.world_id=p_world)<>h.event_sequence or exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world)or jsonb_array_length(w->'frames')<>h.world_version then raise exception 'MIXED_MATCH_COMPLETE_PREFIX_REQUIRED'using errcode='55000';end if;
 -- Independently reconstruct every complete canonical group and compare it to
 -- the actual Core input. No known/foreign frame or posting can be omitted.
 for f in select value from jsonb_array_elements(w->'frames')loop
  select * into strict r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=f->'command'->>'commandId'and x.outcome='COMMITTED';
  select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.command_id=r.command_id;
  if r.world_version_before<>wv or r.world_version_after<>wv+1 or c.expected_world_version is distinct from wv or r.command_fingerprint<>c.command_fingerprint or r.transition_id<>c.command_id or r.idempotency_key is distinct from c.idempotency_key or r.reason_code is not null or r.sim_time<>c.sim_time or c.sim_time<prior_sim then raise exception 'MIXED_MATCH_CANONICAL_RECEIPT_GAP'using errcode='23514';end if;
  cmd:=jsonb_build_object('actorId',c.actor_id,'authSubject',c.auth_subject::text,'commandId',c.command_id,'commandType',c.command_type,'correlationId',c.correlation_id,'countryId',c.country_id,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'officeId',c.office_id,'canonicalPayload',c.canonical_payload,'schemaVersion',c.schema_version,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'worldId',p_world,'fingerprint',c.command_fingerprint,'payloadHash',c.payload_sha256);
  intent:=c.canonical_payload::jsonb;
  if c.schema_version<>'command-v1'or c.canonical_payload<>world_v2.canonical_json(intent)or c.payload_sha256 is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||c.canonical_payload)or c.command_fingerprint is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(cmd-'fingerprint'-'payloadHash'-'correlationId'-'submittedAtReal'))or f->'command'is distinct from cmd then raise exception 'MIXED_MATCH_CANONICAL_COMMAND_CHANGED'using errcode='23514';end if;
  expected_count:=1;
  if c.command_type='CORE_FINANCE_BUDGET_APPROPRIATION_V1'theN
   if c.office_id is distinct from 'FINANCE'or intent->>'operation'not in('SET_ENVELOPE','APPROVE_NEW_LINE')then raise exception 'MIXED_MATCH_UNKNOWN_BUDGET_OPERATION'using errcode='23514';end if;
   expected_count:=case when intent->>'operation'='SET_ENVELOPE'then 1 else 3 end;
  elsif c.command_type in('POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1')then
   if c.office_id is distinct from (case when c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then 'FINANCE'else'SOCIAL'end) then raise exception 'MIXED_MATCH_OFFICE_MISMATCH'using errcode='23514';end if;
  elsif c.command_type='CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'then
   if c.office_id is not null then raise exception 'MIXED_MATCH_AUTOMATIC_FAMILY_REQUIRED'using errcode='23514';end if;
  else raise exception 'MIXED_MATCH_UNKNOWN_FAMILY'using errcode='55000';end if;
  if jsonb_array_length(r.event_ids)<>expected_count then raise exception 'MIXED_MATCH_EVENT_GROUP_INCOMPLETE'using errcode='23514';end if;
  evs:='[]';idx:=0;
  for e in select x.* from world_v2.authoritative_event x join jsonb_array_elements_text(r.event_ids)with ordinality ids(id,n)on x.event_id=ids.id where x.world_id=p_world order by ids.n loop
   expected_type:=case c.command_type when 'CORE_FINANCE_BUDGET_APPROPRIATION_V1'then case when expected_count=1 then'FINANCE_NATIVE_BUDGET_ENVELOPE_SET_V1'when idx=0 then'FINANCE_NATIVE_BUDGET_LINE_CREATED_V1'when idx=1 then'FINANCE_NATIVE_BUDGET_APPROPRIATED_V1'else'FINANCE_NATIVE_BUDGET_LINE_INITIALIZED_V1'end when'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1'when'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'then'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'when'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'then'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1'else'SOCIAL_JOB_MATCH_SETTLED_V1'end;
   byte_count:=byte_count+octet_length(e.canonical_payload)+octet_length(c.canonical_payload);
   if byte_count>2097152 or octet_length(e.canonical_payload)>65536 or octet_length(c.canonical_payload)>16384 or e.event_sequence<>seq+idx+1 or e.world_version<>r.world_version_after or e.causation_command_id<>c.command_id or e.event_type<>expected_type or e.sim_time<>c.sim_time or e.correlation_id<>c.correlation_id or e.corrects_event_id is not null or e.schema_version<>'event-v1'or e.canonical_payload<>world_v2.canonical_json(e.canonical_payload::jsonb)then raise exception 'MIXED_MATCH_EVENT_SCOPE_OR_SEQUENCE_CHANGED'using errcode='23514';end if;
   ev:=jsonb_build_object('causationCommandId',e.causation_command_id,'correlationId',e.correlation_id,'correctsEventId',e.corrects_event_id,'eventId',e.event_id,'eventType',e.event_type,'canonicalPayload',e.canonical_payload,'schemaVersion',e.schema_version,'sequence',e.event_sequence::text,'simTime',e.sim_time::text,'worldId',p_world,'worldVersion',e.world_version::text,'fingerprint',e.event_fingerprint,'payloadHash',e.payload_sha256,'recordedAtReal',to_char(e.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
   if e.payload_sha256 is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||e.canonical_payload)or e.event_fingerprint is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(ev-'fingerprint'-'payloadHash'-'recordedAtReal'))then raise exception 'MIXED_MATCH_EVENT_HASH_CHANGED'using errcode='23514';end if;
   evs:=evs||jsonb_build_array(ev);idx:=idx+1;
  end loop;
  if idx<>expected_count then raise exception 'MIXED_MATCH_EVENT_ROWS_INCOMPLETE'using errcode='23514';end if;
  tr:=jsonb_build_object('schemaVersion','authoritative-transition-v1','transitionId',c.command_id,'worldId',p_world,'commandId',c.command_id,'commandFingerprint',c.command_fingerprint,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'eventIds',r.event_ids,'events',evs);
  rec:=jsonb_build_object('schemaVersion',r.schema_version,'worldId',p_world,'commandId',r.command_id,'idempotencyKey',r.idempotency_key,'commandFingerprint',r.command_fingerprint,'outcome',r.outcome,'reasonCode',r.reason_code,'transitionId',r.transition_id,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'simTime',r.sim_time::text,'eventIds',r.event_ids,'recordedAtReal',to_char(r.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  bs:='[]';leg_count:=0;
  for br in select x.* from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=c.command_id order by case when x.settlement_currency='GCU'then 1 else 0 end,x.batch_id loop
   bp:=br.canonical_payload::jsonb;
   if c.command_type<>'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'or octet_length(br.canonical_payload)>65536 or br.canonical_payload<>world_v2.canonical_json(bp)or bp?'fingerprint'or br.batch_fingerprint is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||br.canonical_payload)or bp->>'batchId'is distinct from br.batch_id or bp->>'worldId'is distinct from p_world or bp->>'causationCommandId'is distinct from c.command_id or br.world_version_before<>wv or br.world_version_after<>wv+1 or br.sim_time<>c.sim_time or br.event_ids<>r.event_ids or bp->>'settlementCurrency'is distinct from br.settlement_currency or bp->'transitionBinding'->>'commandFingerprint'is distinct from c.command_fingerprint then raise exception 'MIXED_MATCH_ACTUAL_BATCH_CHANGED'using errcode='23514';end if;
   byte_count:=byte_count+octet_length(br.canonical_payload);if byte_count>2097152 then raise exception 'MIXED_MATCH_PREFIX_BYTES_EXCEEDED'using errcode='54000';end if;
   leg_count:=leg_count+jsonb_array_length(bp->'legs');bs:=bs||jsonb_build_array(bp||jsonb_build_object('fingerprint',br.batch_fingerprint));batch_count:=batch_count+1;
  end loop;
  if c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then
   if jsonb_array_length(bs)<>2 or leg_count<>6 or(select count(distinct x->>'settlementCurrency')from jsonb_array_elements(bs)x)<>2 then raise exception 'MIXED_MATCH_COMPLETE_FX_BATCHES_REQUIRED'using errcode='23514';end if;
   select x.quote_text::jsonb into q from world_v2.postwar_day_one_fx_quote_original x join world_v2.postwar_day_one_fx_source_original s on s.world_id=x.world_id where x.world_id=p_world and x.country_id=c.country_id and x.quote_ref=intent->>'quoteRef'and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.admission_ref=a.admission_ref and x.quote_text_sha256=encode(sha256(convert_to(x.quote_text,'UTF8')),'hex');
   if q is null or q is distinct from(evs->0->>'canonicalPayload')::jsonb->'quote'or q->>'quoteSha256'is distinct from intent->>'expectedQuoteSha256'then raise exception 'MIXED_MATCH_HISTORICAL_QUOTE_REQUIRED'using errcode='23514';end if;
  end if;
  if f is distinct from jsonb_build_object('command',cmd,'events',evs,'transition',tr,'receipt',rec,'financialPostingBatches',bs,'inventoryPostings','[]'::jsonb)then raise exception 'MIXED_MATCH_CORE_WITNESS_DIFFERS_FROM_ACTUAL_PREFIX'using errcode='23514';end if;
  wv:=r.world_version_after;seq:=seq+expected_count;prior_sim:=c.sim_time;frame_count:=frame_count+1;
 end loop;
 if wv<>h.world_version or seq<>h.event_sequence or frame_count<>h.world_version or batch_count<>(select count(*)from world_v2.financial_posting_batch x where x.world_id=p_world)then raise exception 'MIXED_MATCH_GLOBAL_PREFIX_OR_POSTING_SET_INCOMPLETE'using errcode='23514';end if;
 select * into strict p from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_plan;
 select * into strict pr from world_v2.command_receipt x where x.world_id=p_world and x.command_id=p_plan and x.outcome='COMMITTED';
 if p.command_type<>'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'or p.office_id<>'SOCIAL'or p.country_id<>p_country or p.canonical_payload::jsonb->>'dueDayIndex'<>'0'or p.sim_time<0 or p.sim_time>=86400000 or p.sim_time<prior_sim then raise exception 'MIXED_MATCH_ORIGINAL_PLAN_BOUNDARY_REQUIRED'using errcode='23514';end if;
 -- Idempotence returns the immutable original, never a reversioned command.
 select * into old from world_v2.social_operating_match_publication x where x.world_id=p_world and x.plan_command_id=p_plan and x.rule_version=g.rule_version;
 if found then select * into strict v from world_v2.command_submission x where x.world_id=p_world and x.command_id=old.command_id;if v.command_fingerprint<>old.command_fingerprint or old.grant_ref<>g.grant_ref then raise exception 'MIXED_MATCH_PUBLICATION_CONFLICT'using errcode='23514';end if;return v;end if;
 if w->>'planState'is distinct from 'PENDING'or exists(select 1 from world_v2.command_submission x join world_v2.command_receipt y on y.world_id=x.world_id and y.command_id=x.command_id and y.outcome='COMMITTED'where x.world_id=p_world and x.command_type='CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'and x.canonical_payload::jsonb->>'planCommandId'=p_plan)then raise exception 'MIXED_MATCH_PLAN_ALREADY_SETTLED'using errcode='55000';end if;
 if exists(select 1 from world_v2.command_submission x join world_v2.command_receipt y on y.world_id=x.world_id and y.command_id=x.command_id and y.outcome='COMMITTED'where x.world_id=p_world and x.country_id=p_country and x.command_type='CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'and y.world_version_after>pr.world_version_after and jsonb_build_array(x.canonical_payload::jsonb->>'locationId',x.canonical_payload::jsonb->>'skill',x.canonical_payload::jsonb->>'positionId',x.canonical_payload::jsonb->>'servicePoolId',x.canonical_payload::jsonb->>'dueDayIndex')=jsonb_build_array(p.canonical_payload::jsonb->>'locationId',p.canonical_payload::jsonb->>'skill',p.canonical_payload::jsonb->>'positionId',p.canonical_payload::jsonb->>'servicePoolId',p.canonical_payload::jsonb->>'dueDayIndex'))then raise exception 'MIXED_MATCH_PLAN_SUPERSEDED'using errcode='55000';end if;
 id:='COMMAND_SOCIAL_MATCH_'||upper(encode(sha256(convert_to(jsonb_build_array(g.grant_ref,p.command_fingerprint,g.rule_version)::text,'UTF8')),'hex'));
 payload:=jsonb_build_object('schemaVersion','social-job-match-settlement-v1','planCommandId',p.command_id,'planFingerprint',p.command_fingerprint,'dueDayIndex','0','ruleVersion',g.rule_version);payload_text:=world_v2.canonical_json(payload);
 intent:=jsonb_build_object('actorId',g.actor_id,'authSubject',g.auth_subject::text,'commandId',id,'commandType','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1','countryId',p.country_id,'expectedWorldVersion',h.world_version::text,'idempotencyKey',id,'officeId',null,'canonicalPayload',payload_text,'schemaVersion','command-v1','simTime',p.sim_time::text,'worldId',p_world);
 fp:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(intent));published:=date_trunc('milliseconds',clock_timestamp());
 insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values(p_world,id,id,'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1','command-v1',payload_text,'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||payload_text),fp,g.auth_subject,g.actor_id,p.country_id,null,h.world_version,p.sim_time,p.correlation_id,published);
 insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values(p_world,id,'VERSIONED_AUTOMATIC',p.sim_time);
 insert into world_v2.social_operating_match_publication values(p_world,p_plan,g.rule_version,g.grant_ref,id,fp);
 select * into strict v from world_v2.command_submission x where x.world_id=p_world and x.command_id=id;return v;
end;$$;
alter function world_v2.publish_social_operating_mixed_match_due(text,text,text,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.publish_social_operating_mixed_match_due(text,text,text,text)from public;
grant execute on function world_v2.publish_social_operating_mixed_match_due(text,text,text,text)to world_v2_social_source_publisher;
revoke create on schema world_v2 from world_v2_social_source_owner;
commit;
