-- Candidate fixed publisher. Complete actual pages are DATA bindings, never
-- source admission or a replacement for Core's mandatory automatic cutoff.
-- Depends on social-operating-custody.sql, social-operating-match-publisher.sql,
-- postwar-social-mixed-match-publisher.sql and postwar-social-match-prefix-pages.sql.
-- Install the source-revocation-fence candidate after selected custody DDL.
-- No UI/cache, new role, membership, raw reader grant or history total-size cap.
begin;
grant create on schema world_v2 to world_v2_social_source_owner;
create function world_v2.publish_social_operating_paged_match_due(p_world text,p_country text,p_plan text,p_witness text)
returns world_v2.command_submission language plpgsql security definer set search_path=pg_catalog as $$
declare
 h world_v2.world_head%rowtype;a world_v2.runtime_opening_admission%rowtype;
 bound world_v2.social_operating_source_registration%rowtype;g world_v2.social_operating_match_publisher%rowtype;
 p world_v2.command_submission%rowtype;pr world_v2.command_receipt%rowtype;
 old world_v2.social_operating_match_publication%rowtype;v world_v2.command_submission%rowtype;
 page record;w jsonb;frames jsonb;f jsonb;c jsonb;e jsonb;b jsonb;tr jsonb;r jsonb;intent jsonb;
 expected_head jsonb;from_head jsonb;through_head jsonb;anchor jsonb;effects jsonb;batches jsonb;
 prefix text;effect_hash text;journal_hash text;coverage jsonb;last_id text;last_fp text;
 wv bigint:=0;seq bigint:=0;pages bigint:=0;frame_count bigint:=0;batch_count bigint:=0;leg_count bigint:=0;inventory_count bigint:=0;prior_sim bigint:=0;
 frame_events bigint;frame_batches bigint;frame_inventory bigint;idx bigint;expected_events bigint;expected_type text;expected_batches bigint;expected_legs bigint;
 payload jsonb;payload_text text;id text;fp text;published timestamptz;effective name;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_social_source_publisher'or pg_has_role(effective,'world_v2_social_source_owner','MEMBER')or exists(select 1 from pg_roles x where x.rolname=effective and(x.rolsuper or x.rolbypassrls or x.rolcreaterole or x.rolcreatedb or x.rolreplication))then raise exception 'SOCIAL_FIXED_SEPARATED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'then raise exception 'PAGED_MATCH_HELD_WRITABLE_TRANSACTION_REQUIRED'using errcode='25001';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_plan is null or p_plan=''or p_witness is null or octet_length(p_witness)>65536 then raise exception 'PAGED_MATCH_EXACT_BOUNDED_SCOPE_REQUIRED'using errcode='22023';end if;
 -- Earliest live source read: an old RR snapshot must serialize against
 -- actual revocation/control/seat updates, never refresh or swallow 40001.
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.social_custody_world',p_world,true);
 select * into strict h from world_v2.world_head x where x.world_id=p_world for share;
 a:=world_v2.social_source_admission(p_world);
 select * into strict bound from world_v2.social_operating_source_registration x where x.world_id=p_world and x.country_id=p_country for share;
 select * into strict g from world_v2.social_operating_match_publisher x where x.world_id=p_world and x.country_id=p_country for share;
 if h.world_version<1 or h.event_sequence<h.world_version or bound.seed_fingerprint<>a.seed_fingerprint or bound.admission_ref<>a.admission_ref or g.registration_ref<>bound.registration_ref or g.admission_ref<>a.admission_ref or g.issuer_role<>'world_v2_social_source_publisher'or g.rule_version<>'SOCIAL_JOB_MATCH_RULE_V1'or g.valid_from_day<>0 or g.valid_until_day<>1 or exists(select 1 from world_v2.social_operating_source_revocation x where x.registration_ref=bound.registration_ref)or exists(select 1 from world_v2.social_operating_match_publisher_revocation x where x.grant_ref=g.grant_ref)then raise exception 'PAGED_MATCH_CURRENT_SOURCE_OR_PUBLISHER_REQUIRED'using errcode='55000';end if;
 w:=p_witness::jsonb;
 if p_witness<>world_v2.canonical_json(w)or w->>'schemaVersion'is distinct from 'postwar-paged-match-publication-v1'or w->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text)or w->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or w->'plan'->>'commandId'is distinct from p_plan then raise exception 'PAGED_MATCH_ACTUAL_HEAD_SOURCE_WITNESS_REQUIRED'using errcode='55000';end if;
 expected_head:=jsonb_build_object('worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text);
 anchor:=jsonb_build_object('worldId',p_world,'seedFingerprint',a.seed_fingerprint,'expectedHead',expected_head);
 prefix:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','finance-social-replay-origin-v1')));
 effect_hash:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','postwar-effects-page-origin-v1')));
 journal_hash:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','postwar-financial-page-origin-v1')));
 loop
  select * into strict page from world_v2.read_postwar_social_match_prefix_page(p_world,p_country,wv,seq,h.world_version,h.event_sequence,a.seed_fingerprint,a.admission_ref);
  if page.world_id is distinct from p_world or page.host_country_id is distinct from p_country or page.world_version is distinct from h.world_version::text or page.event_sequence is distinct from h.event_sequence::text or page.seed_id is distinct from a.seed_id or page.seed_fingerprint is distinct from a.seed_fingerprint or page.admission_ref is distinct from a.admission_ref or page.from_world_version is distinct from wv::text or page.from_event_sequence is distinct from seq::text or page.through_world_version::bigint<=wv or page.through_world_version::bigint>h.world_version or page.through_event_sequence::bigint<=seq or page.through_event_sequence::bigint>h.event_sequence or octet_length(page.frames_text)>1048576 then raise exception 'PAGED_MATCH_EXACT_PROGRESSIVE_PAGE_REQUIRED'using errcode='55000';end if;
  frames:=page.frames_text::jsonb;
  if jsonb_typeof(frames)<>'array'or jsonb_array_length(frames)<>page.frame_count::bigint or jsonb_array_length(frames)<1 or jsonb_array_length(frames)>256 or page.frames_text<>world_v2.canonical_json(frames)or page.frames_sha256 is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||page.frames_text)then raise exception 'PAGED_MATCH_EXACT_CANONICAL_PAGE_REQUIRED'using errcode='23514';end if;
  from_head:=jsonb_build_object('worldVersion',wv::text,'eventSequence',seq::text);
  effects:='[]';batches:='[]';frame_events:=0;frame_batches:=0;frame_inventory:=0;
  for f in select value from jsonb_array_elements(frames)loop
   c:=f->'command';tr:=f->'transition';r:=f->'receipt';intent:=(c->>'canonicalPayload')::jsonb;
   if c->>'worldId'is distinct from p_world or c->>'schemaVersion'is distinct from 'command-v1'or c->>'expectedWorldVersion'is distinct from wv::text or(c->>'simTime')::bigint<prior_sim or c->>'fingerprint'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(c-'fingerprint'-'payloadHash'-'correlationId'-'submittedAtReal'))or c->>'payloadHash'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||(c->>'canonicalPayload'))or r->>'outcome'is distinct from 'COMMITTED'or r->>'worldVersionBefore'is distinct from wv::text or r->>'worldVersionAfter'is distinct from(wv+1)::text or r->>'commandFingerprint'is distinct from c->>'fingerprint'or r->>'reasonCode'is not null or tr->>'commandFingerprint'is distinct from c->>'fingerprint'or tr->'events'is distinct from f->'events'or tr->>'worldVersionBefore'is distinct from wv::text or tr->>'worldVersionAfter'is distinct from(wv+1)::text then raise exception 'PAGED_MATCH_CANONICAL_GROUP_OR_HASH_REQUIRED'using errcode='23514';end if;
   expected_events:=1;expected_batches:=0;expected_legs:=0;
   case c->>'commandType'
    when'CORE_FINANCE_BUDGET_APPROPRIATION_V1'then if intent->>'operation'='APPROVE_NEW_LINE'then expected_events:=3;elsif intent->>'operation'is distinct from'SET_ENVELOPE'then raise exception 'PAGED_MATCH_UNKNOWN_BUDGET_OPERATION'using errcode='55000';end if;
    when'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then null;
    when'CORE_CENTRAL_BANK_OMO_V1'then expected_batches:=1;expected_legs:=4;
    when'POSTWAR_BENEFICIAL_HOUSING_RENT_V1'then expected_batches:=1;expected_legs:=2;
    when'CORE_GOODS_DELIVERY_V1'then expected_batches:=1;expected_legs:=2;
    when'CORE_GOODS_TRANSFER_V1'then null;
    when'CORE_GOODS_SHIPMENT_V1'then null;
    when'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'then null;
    when'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'then null;
    when'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1'then null;
    when'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'then null;
    when'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'then null;
    else raise exception 'PAGED_MATCH_UNKNOWN_COMPLETE_PREFIX_FAMILY'using errcode='55000';
   end case;
   if c->>'commandType'='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then expected_batches:=2;expected_legs:=6;end if;
   if jsonb_array_length(f->'events')<>expected_events or jsonb_array_length(f->'financialPostingBatches')<>expected_batches or jsonb_array_length(f->'inventoryPostings')<>(case when c->>'commandType'in('CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')then 1 else 0 end)then raise exception 'PAGED_MATCH_COMPLETE_EVENT_JOURNAL_FAMILY_REQUIRED'using errcode='23514';end if;
   idx:=0;
   for e in select value from jsonb_array_elements(f->'events')loop
    expected_type:=case c->>'commandType'when'CORE_FINANCE_BUDGET_APPROPRIATION_V1'then case when expected_events=1 then'FINANCE_NATIVE_BUDGET_ENVELOPE_SET_V1'when idx=0 then'FINANCE_NATIVE_BUDGET_LINE_CREATED_V1'when idx=1 then'FINANCE_NATIVE_BUDGET_APPROPRIATED_V1'else'FINANCE_NATIVE_BUDGET_LINE_INITIALIZED_V1'end when'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1'when'CORE_CENTRAL_BANK_OMO_V1'then'CENTRAL_BANK_OMO_SETTLED_V1'when'POSTWAR_BENEFICIAL_HOUSING_RENT_V1'then'POSTWAR_BENEFICIAL_HOUSING_RENT_SETTLED_V1'when'CORE_GOODS_TRANSFER_V1'then'NARROW_TREASURY_GCU_RESERVED_V1'when'CORE_GOODS_SHIPMENT_V1'then'NARROW_TREASURY_GCU_SHIPPED_V1'when'CORE_GOODS_DELIVERY_V1'then'NARROW_TREASURY_GCU_DELIVERED_V1'when'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'then'CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1'when'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'then'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'when'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1'then'SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1'when'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'then'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1'else'SOCIAL_JOB_MATCH_SETTLED_V1'end;
    if e->>'worldId'is distinct from p_world or e->>'eventType'is distinct from expected_type or e->>'schemaVersion'is distinct from'event-v1'or e->>'causationCommandId'is distinct from c->>'commandId'or e->>'correlationId'is distinct from c->>'correlationId'or e->>'worldVersion'is distinct from(wv+1)::text or e->>'sequence'is distinct from(seq+idx+1)::text or e->>'simTime'is distinct from c->>'simTime'or e->'correctsEventId'<>'null'::jsonb or e->>'payloadHash'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||(e->>'canonicalPayload'))or e->>'fingerprint'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(e-'fingerprint'-'payloadHash'-'recordedAtReal'))then raise exception 'PAGED_MATCH_EXACT_EVENT_HASH_SEQUENCE_REQUIRED'using errcode='23514';end if;
    if c->>'commandType'='CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1'then
     if to_regprocedure('world_v2.postwar_social_employment_creation_effect_scoped(text,text,jsonb,jsonb,bigint)')is null then raise exception 'PAGED_MATCH_CREATION_ORIGINALS_REQUIRED'using errcode='55000';end if;
     if not world_v2.postwar_social_employment_creation_effect_scoped(p_world,c->>'countryId',c,(e->>'canonicalPayload')::jsonb,(e->>'sequence')::bigint)then raise exception 'PAGED_MATCH_CREATION_ORIGINALS_INVALID'using errcode='23514';end if;
    end if;
    idx:=idx+1;last_id:=e->>'eventId';last_fp:=e->>'fingerprint';
   end loop;
   if coalesce((select sum(jsonb_array_length(x->'legs'))from jsonb_array_elements(f->'financialPostingBatches')x),0)<>expected_legs then raise exception 'PAGED_MATCH_EXACT_FINANCIAL_LEG_SET_REQUIRED'using errcode='23514';end if;
   for b in select value from jsonb_array_elements(f->'financialPostingBatches')loop
    if b->>'worldId'is distinct from p_world or b->>'causationCommandId'is distinct from c->>'commandId'or b->'causationEventIds'is distinct from tr->'eventIds'or b->>'worldVersionBefore'is distinct from wv::text or b->>'worldVersionAfter'is distinct from(wv+1)::text or b->>'simTime'is distinct from c->>'simTime'or b->'transitionBinding'->>'commandFingerprint'is distinct from c->>'fingerprint'or b->>'fingerprint'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(b-'fingerprint'))then raise exception 'PAGED_MATCH_EXACT_ACTUAL_FINANCIAL_BATCH_REQUIRED'using errcode='23514';end if;
   end loop;
   effects:=effects||jsonb_build_array(jsonb_build_object('commandId',c->>'commandId','countryId',c->>'countryId','commandType',c->>'commandType','transitionFingerprint','sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(tr)),'receiptFingerprint','sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(r)),'eventFingerprints',(select jsonb_agg(x->'fingerprint'order by n)from jsonb_array_elements(f->'events')with ordinality q(x,n)),'worldVersionBefore',r->>'worldVersionBefore','worldVersionAfter',r->>'worldVersionAfter','events',(select jsonb_agg(jsonb_build_object('eventId',x->>'eventId','fingerprint',x->>'fingerprint','sequence',x->>'sequence','worldVersion',x->>'worldVersion')order by n)from jsonb_array_elements(f->'events')with ordinality q(x,n))));
   batches:=batches||(f->'financialPostingBatches');leg_count:=leg_count+expected_legs;frame_events:=frame_events+expected_events;frame_batches:=frame_batches+expected_batches;frame_inventory:=frame_inventory+jsonb_array_length(f->'inventoryPostings');frame_count:=frame_count+1;wv:=wv+1;seq:=seq+expected_events;prior_sim:=(c->>'simTime')::bigint;
  end loop;
  if wv::text<>page.through_world_version or seq::text<>page.through_event_sequence or frame_events::text<>page.event_count or frame_batches::text<>page.financial_batch_count or frame_inventory::text<>page.inventory_posting_count then raise exception 'PAGED_MATCH_ACTUAL_PAGE_TOTALS_CHANGED'using errcode='23514';end if;
  through_head:=jsonb_build_object('worldVersion',wv::text,'eventSequence',seq::text);
  anchor:=jsonb_build_object('worldId',p_world,'seedFingerprint',a.seed_fingerprint,'fromHead',from_head,'throughHead',through_head,'expectedHead',expected_head);
  prefix:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','finance-social-replay-page-chain-v1','previous',prefix,'framesSha256',page.frames_sha256)));
  effect_hash:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','postwar-effects-page-chain-v1','previous',effect_hash,'effects',effects)));
  journal_hash:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','postwar-financial-page-chain-v1','previous',journal_hash,'batches',batches)));
  batch_count:=batch_count+frame_batches;inventory_count:=inventory_count+frame_inventory;pages:=pages+1;
  exit when not page.has_more;
 end loop;
 if wv<>h.world_version or seq<>h.event_sequence or frame_count::text<>page.total_frame_count or seq::text<>page.total_event_count or batch_count::text<>page.total_financial_batch_count or inventory_count::text<>page.total_inventory_posting_count then raise exception 'PAGED_MATCH_COMPLETE_ACTUAL_PREFIX_REQUIRED'using errcode='55000';end if;
 coverage:=jsonb_build_object('prefixFingerprint',prefix,'knownEffectsFingerprint',effect_hash,'coveredThroughEventId',last_id,'coveredThroughEventFingerprint',last_fp,'financialPostingCount',leg_count::text,'financialBatchCount',batch_count::text,'financialPostingsFingerprint',journal_hash,'pageProof',jsonb_build_object('schemaVersion','postwar-complete-page-proof-v1','hashAlgorithm','COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1','pageCount',pages::text,'frameCount',frame_count::text));
 if w->'coverage'is distinct from coverage then raise exception 'PAGED_MATCH_CORE_ACTUAL_PAGE_CHAIN_MISMATCH'using errcode='23514';end if;
 select * into strict p from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_plan;
 select * into strict pr from world_v2.command_receipt x where x.world_id=p_world and x.command_id=p_plan and x.outcome='COMMITTED';
 if p.command_type<>'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'or p.office_id<>'SOCIAL'or p.country_id<>p_country or p.canonical_payload::jsonb->>'dueDayIndex'<>'0'or p.sim_time<0 or p.sim_time>=86400000 or p.sim_time<prior_sim or w->'plan'is distinct from jsonb_build_object('commandId',p.command_id,'commandFingerprint',p.command_fingerprint,'canonicalPayload',p.canonical_payload)then raise exception 'PAGED_MATCH_IMMUTABLE_CURRENT_PLAN_REQUIRED'using errcode='23514';end if;
 select * into old from world_v2.social_operating_match_publication x where x.world_id=p_world and x.plan_command_id=p_plan and x.rule_version=g.rule_version;
 if found then select * into strict v from world_v2.command_submission x where x.world_id=p_world and x.command_id=old.command_id;if v.command_fingerprint<>old.command_fingerprint or old.grant_ref<>g.grant_ref then raise exception 'PAGED_MATCH_PUBLICATION_CONFLICT'using errcode='23514';end if;return v;end if;
 if w->>'planState'is distinct from'PENDING'or exists(select 1 from world_v2.command_submission x join world_v2.command_receipt y on y.world_id=x.world_id and y.command_id=x.command_id and y.outcome='COMMITTED'where x.world_id=p_world and x.command_type='CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'and x.canonical_payload::jsonb->>'planCommandId'=p_plan)then raise exception 'PAGED_MATCH_PLAN_ALREADY_SETTLED'using errcode='55000';end if;
 if exists(select 1 from world_v2.command_submission x join world_v2.command_receipt y on y.world_id=x.world_id and y.command_id=x.command_id and y.outcome='COMMITTED'where x.world_id=p_world and x.country_id=p_country and x.command_type='CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'and y.world_version_after>pr.world_version_after and jsonb_build_array(x.canonical_payload::jsonb->>'locationId',x.canonical_payload::jsonb->>'skill',x.canonical_payload::jsonb->>'positionId',x.canonical_payload::jsonb->>'servicePoolId',x.canonical_payload::jsonb->>'dueDayIndex')=jsonb_build_array(p.canonical_payload::jsonb->>'locationId',p.canonical_payload::jsonb->>'skill',p.canonical_payload::jsonb->>'positionId',p.canonical_payload::jsonb->>'servicePoolId',p.canonical_payload::jsonb->>'dueDayIndex'))then raise exception 'PAGED_MATCH_PLAN_SUPERSEDED'using errcode='55000';end if;
 id:='COMMAND_SOCIAL_MATCH_'||upper(encode(sha256(convert_to(jsonb_build_array(g.grant_ref,p.command_fingerprint,g.rule_version)::text,'UTF8')),'hex'));
 payload:=jsonb_build_object('schemaVersion','social-job-match-settlement-v1','planCommandId',p.command_id,'planFingerprint',p.command_fingerprint,'dueDayIndex','0','ruleVersion',g.rule_version);payload_text:=world_v2.canonical_json(payload);
 intent:=jsonb_build_object('actorId',g.actor_id,'authSubject',g.auth_subject::text,'commandId',id,'commandType','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1','countryId',p.country_id,'expectedWorldVersion',h.world_version::text,'idempotencyKey',id,'officeId',null,'canonicalPayload',payload_text,'schemaVersion','command-v1','simTime',p.sim_time::text,'worldId',p_world);
 fp:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(intent));published:=date_trunc('milliseconds',clock_timestamp());
 insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values(p_world,id,id,'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1','command-v1',payload_text,'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||payload_text),fp,g.auth_subject,g.actor_id,p.country_id,null,h.world_version,p.sim_time,p.correlation_id,published);
 insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values(p_world,id,'VERSIONED_AUTOMATIC',p.sim_time);
 insert into world_v2.social_operating_match_publication values(p_world,p_plan,g.rule_version,g.grant_ref,id,fp);
 select * into strict v from world_v2.command_submission x where x.world_id=p_world and x.command_id=id;return v;
end;$$;
alter function world_v2.publish_social_operating_paged_match_due(text,text,text,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.publish_social_operating_paged_match_due(text,text,text,text)from public;
grant execute on function world_v2.publish_social_operating_paged_match_due(text,text,text,text)to world_v2_social_source_publisher;
revoke create on schema world_v2 from world_v2_social_source_owner;
commit;
