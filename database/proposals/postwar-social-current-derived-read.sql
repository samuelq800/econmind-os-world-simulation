-- SOURCE-ONLY extension of postwar-office-derived-read.sql. No production install.
-- Current pages are disposable derived data; immutable Events remain authority.
-- A conservative supported prefix is required. No unknown/cross-country effect
-- is silently called unrelated, and an old state is never lifted to a new head.
begin;
grant usage,create on schema world_v2 to world_v2_postwar_projection_owner;
grant select on world_v2.current_materialization,world_v2.authoritative_event,world_v2.command_submission,world_v2.command_receipt to world_v2_postwar_projection_owner;
grant update(world_version) on world_v2.current_materialization to world_v2_postwar_projection_owner;
do $$declare t text;begin foreach t in array array['current_materialization','authoritative_event','command_submission','command_receipt']loop
 execute format('create policy %I on world_v2.%I for select to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner'' and world_id=current_setting(''econmind.postwar_projection_world'',true))','postwar_current_owner_'||t,t);
 execute format('create policy %I on world_v2.%I as restrictive for select to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner'' and world_id=current_setting(''econmind.postwar_projection_world'',true))','postwar_current_world_'||t,t);
end loop;end;$$;
create table world_v2.postwar_social_current_document(
 document_ref text primary key,world_id text not null,country_id text not null,
 dataset text not null check(dataset in('positions','service-pools')),
 base_document_ref text not null,world_version bigint not null check(world_version>0),event_sequence bigint not null check(event_sequence>0),
 source_command_id text not null,source_event_id text not null,materialization_key text not null,
 materialization_hash text not null check(materialization_hash~'^sha256:[a-f0-9]{64}$'),
 materialization_sha256 text not null check(materialization_sha256~'^[a-f0-9]{64}$'),
 binding jsonb not null,source_version text not null unique,document_sha256 text not null,
 total_rows integer not null check(total_rows>=0),page_count integer not null check(page_count>0),
 foreign key(base_document_ref,world_id)references world_v2.postwar_office_projection_document(document_ref,world_id),
 foreign key(world_id,source_command_id)references world_v2.command_receipt(world_id,command_id),
 foreign key(world_id,source_event_id)references world_v2.authoritative_event(world_id,event_id),
 unique(world_id,country_id,dataset,world_version,event_sequence),unique(document_ref,world_id)
);
create table world_v2.postwar_social_current_page(
 document_ref text not null,world_id text not null,page_index integer not null check(page_index>=0),row_offset integer not null check(row_offset>=0),
 row_count integer not null check(row_count between 0 and 100),rows_text text not null check(octet_length(rows_text)<=48000 and jsonb_typeof(rows_text::jsonb)='array'),
 page_sha256 text not null check(page_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),
 primary key(document_ref,page_index),foreign key(document_ref,world_id)references world_v2.postwar_social_current_document(document_ref,world_id),
 check(jsonb_array_length(rows_text::jsonb)=row_count)
);
do $$declare t text;begin foreach t in array array['postwar_social_current_document','postwar_social_current_page']loop
 execute format('alter table world_v2.%I owner to world_v2_postwar_projection_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public,world_v2_postwar_projection_reader,world_v2_postwar_projection_publisher',t);
 execute format('create policy %I on world_v2.%I to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner'' and world_id=current_setting(''econmind.postwar_projection_world'',true))with check(current_user=''world_v2_postwar_projection_owner'' and world_id=current_setting(''econmind.postwar_projection_world'',true))',t||'_owner',t);
 execute format('create policy %I on world_v2.%I as restrictive to world_v2_postwar_projection_owner using(world_id=current_setting(''econmind.postwar_projection_world'',true))with check(world_id=current_setting(''econmind.postwar_projection_world'',true))',t||'_world',t);
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t||'_immutable',t);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t||'_truncate',t);
end loop;end;$$;
-- Private bounded witness. No seed canonical_payload is read here. No caller
-- chooses JSON/pointers/state hashes. Maximum country state is 1 MiB.
create function world_v2.postwar_current_social_witness(p_world text,p_country text)
returns table(world_version bigint,event_sequence bigint,state jsonb,binding jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare h record;e record;c record;r record;m record;ep jsonb;st jsonb;key text;expected_command text;expected_schema text;raw_sha text;event_intent jsonb;
begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into h from world_v2.world_head where world_id=p_world;
 if not found or h.world_version<1 or h.world_version>10000 or h.event_sequence<1 or h.event_sequence>10000 then return;end if;
 -- Complete contiguous committed prefix, all effects understood for this country.
 if (select count(*)from world_v2.authoritative_event x where x.world_id=p_world)<>h.event_sequence
 or (select min(x.event_sequence)from world_v2.authoritative_event x where x.world_id=p_world)<>1
 or (select max(x.event_sequence)from world_v2.authoritative_event x where x.world_id=p_world)<>h.event_sequence
 or (select count(*)from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED')<>h.world_version
 or (select count(distinct x.world_version_after)from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED'and x.world_version_before>=0 and x.world_version_after<=h.world_version)<>h.world_version
 or exists(select 1 from world_v2.authoritative_event x join world_v2.command_submission q on q.world_id=x.world_id and q.command_id=x.causation_command_id left join world_v2.command_receipt z on z.world_id=x.world_id and z.command_id=x.causation_command_id where x.world_id=p_world and(z.outcome is distinct from 'COMMITTED'or z.world_version_after is distinct from x.world_version or z.command_fingerprint<>q.command_fingerprint or z.sim_time<>x.sim_time or not(z.event_ids @>jsonb_build_array(x.event_id))or q.country_id<>p_country or x.corrects_event_id is not null or x.event_type not in('SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1')))
 or exists(select 1 from world_v2.command_receipt z where z.world_id=p_world and z.outcome='COMMITTED' and z.event_ids is distinct from (select jsonb_agg(x.event_id order by x.event_sequence)from world_v2.authoritative_event x where x.world_id=p_world and x.causation_command_id=z.command_id))then return;end if;
 select * into e from world_v2.authoritative_event where world_id=p_world and authoritative_event.event_sequence=h.event_sequence and authoritative_event.world_version=h.world_version;
 if not found or octet_length(e.canonical_payload)>1048576 then return;end if;
 select * into strict c from world_v2.command_submission where world_id=p_world and command_id=e.causation_command_id;
 select * into strict r from world_v2.command_receipt where world_id=p_world and command_id=e.causation_command_id;
 if r.event_ids<>jsonb_build_array(e.event_id)or c.expected_world_version is distinct from h.world_version-1 then return;end if;
 if e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'then key:='SOCIAL_POSITION_LIFECYCLE_'||p_country;expected_command:='CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1';expected_schema:='social-employment-position-offer-event-v1';
 elsif e.event_type='SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1'then key:='SOCIAL_EMPLOYMENT_SERVICE_'||p_country;expected_command:='CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1';expected_schema:='social-employment-service-event-v1';
 elsif e.event_type='SOCIAL_JOB_MATCH_SETTLED_V1'then key:='SOCIAL_EMPLOYMENT_SERVICE_'||p_country;expected_command:='CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1';expected_schema:='social-employment-service-event-v1';else return;end if;
 select * into m from world_v2.current_materialization where world_id=p_world and materialization_key=key;
 if not found or m.world_version<>h.world_version or m.source_command_id<>c.command_id or octet_length(m.canonical_payload)>1048576 then return;end if;
 raw_sha:=encode(sha256(convert_to(m.canonical_payload,'UTF8')),'hex');ep:=e.canonical_payload::jsonb;st:=m.canonical_payload::jsonb;
 event_intent:=jsonb_build_object('causationCommandId',e.causation_command_id,'correlationId',e.correlation_id,'correctsEventId',e.corrects_event_id,'eventId',e.event_id,'eventType',e.event_type,'canonicalPayload',e.canonical_payload,'schemaVersion',e.schema_version,'sequence',e.event_sequence::text,'simTime',e.sim_time::text,'worldId',p_world,'worldVersion',e.world_version::text);
 if e.schema_version<>'event-v1'or c.command_type<>expected_command or ep->>'schemaVersion'is distinct from expected_schema
 or ep->'command'->>'worldId'is distinct from p_world or ep->'command'->>'countryId'is distinct from p_country or ep->'command'->>'commandId'is distinct from c.command_id
 or ep->'command'->>'commandType'is distinct from c.command_type or ep->'command'->>'expectedWorldVersion'is distinct from c.expected_world_version::text
 or world_v2.canonical_json(ep->'command'->'payload')is distinct from c.canonical_payload
 or m.canonical_payload<>world_v2.canonical_json(st)or e.canonical_payload<>world_v2.canonical_json(ep)
 or m.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||m.canonical_payload,'UTF8')),'hex')
 or ep->>'afterStateHash'is distinct from m.payload_sha256
 or e.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||e.canonical_payload,'UTF8')),'hex')
 or e.event_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(event_intent),'UTF8')),'hex')then return;end if;
 if key='SOCIAL_POSITION_LIFECYCLE_'||p_country then
  if st->>'schemaVersion'is distinct from 'social-employment-position-lifecycle-v1'or jsonb_typeof(st->'offers')is distinct from 'array'or jsonb_typeof(st->'reservations')is distinct from 'array'or jsonb_typeof(st->'operations')is distinct from 'array'then return;end if;st:=st->'employment';
 end if;
 if st->>'schemaVersion'is distinct from 'social-employment-service-state-v1'or st->>'worldId'is distinct from p_world
 or jsonb_typeof(st->'labour'->'positions')is distinct from 'array'or jsonb_typeof(st->'labour'->'aggregates')is distinct from 'array'or jsonb_typeof(st->'labour'->'wageAssertions')is distinct from 'array'or jsonb_typeof(st->'servicePools')is distinct from 'array'then return;end if;
 if exists(select 1 from jsonb_array_elements((st->'labour'->'positions')||(st->'labour'->'aggregates')||(st->'servicePools'))x where x->>'countryId'is distinct from p_country)
 or exists(select 1 from jsonb_array_elements(st->'labour'->'wageAssertions')x where not exists(select 1 from jsonb_array_elements(st->'labour'->'positions')p where p->>'positionId'=x->>'positionId'))then return;end if;
 return query select h.world_version,h.event_sequence,st,jsonb_build_object('sourceCommandId',c.command_id,'commandFingerprint',c.command_fingerprint,'sourceEventId',e.event_id,'eventFingerprint',e.event_fingerprint,'materializationKey',key,'materializationHash',m.payload_sha256,'canonicalMaterializationSha256',raw_sha,'sourceStateWorldVersion',m.world_version::text,'sourceEventSequence',e.event_sequence::text);
exception when invalid_text_representation then return;
end;$$;
alter function world_v2.postwar_current_social_witness(text,text)owner to world_v2_postwar_projection_owner;
create function world_v2.publish_postwar_social_current_projection(p_world text,p_country text)
returns setof world_v2.postwar_social_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;w record;a record;base world_v2.postwar_office_projection_document%rowtype;dataset_name text;items jsonb;item jsonb;buffer jsonb;pages integer;idx integer;off integer;hash text;ref text;version text;existing world_v2.postwar_social_current_document%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')then raise exception 'POSTWAR_FIXED_PROJECTION_PUBLISHER_REQUIRED'using errcode='42501';end if;
 -- Controlled publication uses fresh snapshots after acquiring revocation locks.
 if current_setting('transaction_isolation')<>'read committed'then raise exception 'POSTWAR_CURRENT_PUBLICATION_FRESH_READ_COMMITTED_REQUIRED'using errcode='25000';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world for share;
 select * into a from world_v2.postwar_projection_admission_header(p_world);if not found then raise exception 'POSTWAR_CURRENT_ADMISSION_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref for share;
 if exists(select 1 from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit q using(authorization_id)where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref)then raise exception 'POSTWAR_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
 select * into w from world_v2.postwar_current_social_witness(p_world,p_country);if not found then raise exception 'POSTWAR_CURRENT_SOCIAL_WITNESS_UNAVAILABLE'using errcode='55000';end if;
 perform 1 from world_v2.current_materialization where world_id=p_world and materialization_key=w.binding->>'materializationKey'for share;
 foreach dataset_name in array array['positions','service-pools']loop
  select * into base from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id='SOCIAL'and d.dataset=dataset_name and d.admission_ref=a.admission_ref and d.seed_fingerprint=a.seed_fingerprint and d.source_bundle_sha256=a.source_bundle_sha256 for share;
  if not found or exists(select 1 from world_v2.postwar_office_projection_revocation x where x.world_id=p_world and x.document_ref=base.document_ref)then raise exception 'POSTWAR_CURRENT_H0_SOURCE_BINDING_REQUIRED'using errcode='55000';end if;
  items:=case dataset_name when 'positions'then w.state->'labour'->'positions'else w.state->'servicePools'end;
  hash:=encode(sha256(convert_to(items::text,'UTF8')),'hex');ref:='POSTWAR_CURRENT_'||upper(encode(sha256(convert_to(jsonb_build_array(base.document_ref,w.world_version,w.event_sequence,w.binding,dataset_name,hash)::text,'UTF8')),'hex'));version:='sha256:'||encode(sha256(convert_to(ref||hash,'UTF8')),'hex');
  select * into existing from world_v2.postwar_social_current_document d where d.world_id=p_world and d.country_id=p_country and d.dataset=dataset_name and d.world_version=w.world_version and d.event_sequence=w.event_sequence;
  if found then if existing.document_ref<>ref then raise exception 'POSTWAR_CURRENT_IMMUTABLE_CONFLICT'using errcode='23514';end if;return next existing;continue;end if;
  pages:=1;buffer:='[]';for item in select value from jsonb_array_elements(items)loop
   if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'POSTWAR_CURRENT_ROW_TOO_LARGE'using errcode='54000';end if;
   if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then pages:=pages+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
  end loop;
  insert into world_v2.postwar_social_current_document values(ref,p_world,p_country,dataset_name,base.document_ref,w.world_version,w.event_sequence,w.binding->>'sourceCommandId',w.binding->>'sourceEventId',w.binding->>'materializationKey',w.binding->>'materializationHash',w.binding->>'canonicalMaterializationSha256',w.binding,version,hash,jsonb_array_length(items),pages);
  buffer:='[]';idx:=0;off:=0;for item in select value from jsonb_array_elements(items)loop
   if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then
    insert into world_v2.postwar_social_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
  end loop;
  insert into world_v2.postwar_social_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
  select * into strict existing from world_v2.postwar_social_current_document where document_ref=ref;return next existing;
 end loop;
end;$$;
alter function world_v2.publish_postwar_social_current_projection(text,text)owner to world_v2_postwar_projection_owner;
-- Keep H0 implementation and immutable rows unchanged. The old entry is private.
alter function world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)rename to read_postwar_office_projection_h0_page;
revoke all on function world_v2.read_postwar_office_projection_h0_page(text,text,text,integer,integer,text)from public,world_v2_postwar_projection_reader;
create function world_v2.read_postwar_office_projection_page(p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected_version text default null)
returns table(status text,scope_json jsonb,source_json jsonb,page_json jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;w record;d world_v2.postwar_social_current_document%rowtype;b world_v2.postwar_office_projection_document%rowtype;p world_v2.postwar_social_current_page%rowtype;selected jsonb;items jsonb;expected_page jsonb;returned integer;
begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 then raise exception 'POSTWAR_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office and(p_office<>'SOCIAL'or exists(select 1 from world_v2.current_commit_authorization a where a.world_id=x.world_id and a.auth_subject::text=x.auth_subject and a.country_id=x.country_id and a.office_id='SOCIAL'and a.team_id=x.team_id and a.authorization_version=x.authorization_revision and a.capability='SOCIAL_LABOUR'and a.active));
 if not found then return query select 'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if s.world_version='0'and s.event_sequence='0'then return query select * from world_v2.read_postwar_office_projection_h0_page(p_world,p_office,p_dataset,p_offset,p_limit,p_expected_version);return;end if;
 if p_office<>'SOCIAL'or p_dataset not in('positions','service-pools')then return query select 'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into w from world_v2.postwar_current_social_witness(p_world,s.country_id);
 if not found then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_social_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.dataset=p_dataset and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint and x.binding=w.binding;
 if not found then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 items:=case p_dataset when 'positions'then w.state->'labour'->'positions'else w.state->'servicePools'end;
 if d.total_rows<>jsonb_array_length(items)or d.document_sha256<>encode(sha256(convert_to(items::text,'UTF8')),'hex')or d.materialization_hash is distinct from w.binding->>'materializationHash'or d.materialization_sha256 is distinct from w.binding->>'canonicalMaterializationSha256'then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into b from world_v2.postwar_office_projection_document x where x.document_ref=d.base_document_ref and x.world_id=p_world and x.country_id=s.country_id and x.office_id='SOCIAL'and x.dataset=p_dataset and x.admission_ref=s.admission_ref and x.seed_fingerprint=s.seed_fingerprint and x.source_bundle_sha256=s.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=x.document_ref and r.world_id=p_world);
 if not found then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected_version is not null and p_expected_version<>d.source_version then return query select 'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into p from world_v2.postwar_social_current_page x where x.document_ref=d.document_ref and x.row_offset<=p_offset and(p_offset<x.row_offset+x.row_count or d.total_rows=0)order by x.page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]';else
  if p.document_ref is null then raise exception 'POSTWAR_CURRENT_PAGE_MISSING'using errcode='23514';end if;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)into expected_page from jsonb_array_elements(items)with ordinality where ordinality>p.row_offset and ordinality<=p.row_offset+p.row_count;
  if expected_page is distinct from p.rows_text::jsonb or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)into selected from jsonb_array_elements(p.rows_text::jsonb)with ordinality where ordinality>p_offset-p.row_offset and ordinality<=p_offset-p.row_offset+p_limit;
 end if;returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature','ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION','sourceVersion',d.source_version,'sourceRevision',b.source_revision,'seedId',b.seed_id,'seedFingerprint',b.seed_fingerprint,'admissionRef',b.admission_ref,'modelVersion',b.model_version,'replayBinding',b.replay_binding,'sourceBundleSha256',b.source_bundle_sha256,'canonicalSeedSha256',b.canonical_seed_sha256,'worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text,'pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',jsonb_build_object('table','current_materialization','key',d.materialization_key,'path',(case when d.materialization_key like 'SOCIAL_POSITION_LIFECYCLE_%'then'employment.'else''end)||case p_dataset when'positions'then'labour.positions'else'servicePools'end),'currentStateBinding',d.binding),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_current_social_witness(text,text),world_v2.publish_postwar_social_current_projection(text,text),world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)from public;
grant execute on function world_v2.publish_postwar_social_current_projection(text,text)to world_v2_postwar_projection_publisher;
grant execute on function world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
