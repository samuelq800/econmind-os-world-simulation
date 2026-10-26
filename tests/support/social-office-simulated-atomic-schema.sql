-- Disposable SINGLE_SOCIAL_OFFICE_SIM_V1 fixture only. Not a production migration.
-- Install after the unchanged 23 migrations, read-binding proposal and D source fixture.
-- Lock privilege only, not a second head. The reader cannot update economic head columns.
alter table world_v2.world_head add column social_demo_lock_column boolean not null default true check(social_demo_lock_column);
create function world_v2.social_demo_head_lock_column() returns trigger
language plpgsql set search_path=pg_catalog as $$ begin
  if new.social_demo_lock_column is distinct from old.social_demo_lock_column then raise exception 'SOCIAL_HEAD_LOCK_COLUMN_IMMUTABLE'; end if;
  return new;
end $$;
create trigger social_demo_head_lock_only before update of social_demo_lock_column on world_v2.world_head for each row execute function world_v2.social_demo_head_lock_column();
create policy social_demo_exact_seed_read on world_v2.opening_seed for select
using (world_id='WORLD_SOCIAL_SINGLE_DEMO_V1' and current_user not in ('anon','authenticated','service_role','world_v2_api_reader','world_v2_api_login'));
create table world_v2.social_demo_automatic_authorization (
  simulation_id text not null, world_id text not null, country_id text not null,
  source_class text not null check(source_class='SIMULATED_OPENING'),
  issuer_ref text not null, publisher_version text not null, actor_id text not null,
  auth_subject uuid not null, command_type text not null, rule_version text not null,
  valid_from_day bigint not null check(valid_from_day>=0),
  valid_until_day bigint not null check(valid_until_day>valid_from_day),
  authorization_version text not null check(authorization_version<>''), active boolean not null,
  primary key(simulation_id,world_id,country_id,issuer_ref,command_type,rule_version),
  foreign key(simulation_id,world_id,country_id) references world_v2.social_demo_source_scope
);

create function world_v2.social_demo_authority_anchor() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare w text;
begin
  if tg_op='DELETE' then w:=old.world_id; else w:=new.world_id; end if;
  if w='WORLD_SOCIAL_SINGLE_DEMO_V1' then
    perform 1 from world_v2.social_demo_source_scope where simulation_id='SINGLE_SOCIAL_OFFICE_SIM_V1' and world_id=w and country_id='COUNTRY_01' for update;
    if not found then raise exception 'SOCIAL_AUTHORITY_ANCHOR_REQUIRED'; end if;
  end if;
  if tg_op='UPDATE' and old.world_id is distinct from new.world_id then raise exception 'SOCIAL_AUTHORITY_SCOPE_IMMUTABLE'; end if;
  if tg_table_name='social_demo_automatic_authorization' and tg_op='UPDATE' and
    (to_jsonb(new)-array['active','authorization_version']) is distinct from (to_jsonb(old)-array['active','authorization_version']) then raise exception 'SOCIAL_AUTOMATIC_TUPLE_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger social_demo_manual_source_first before insert or update or delete on world_v2.current_commit_authorization for each row execute function world_v2.social_demo_authority_anchor();
create trigger social_demo_seat_source_first before insert or update or delete on world_v2.runtime_read_seat for each row execute function world_v2.social_demo_authority_anchor();
create trigger social_demo_auto_source_first before insert or update or delete on world_v2.social_demo_automatic_authorization for each row execute function world_v2.social_demo_authority_anchor();
create trigger social_demo_auto_no_truncate before truncate on world_v2.social_demo_automatic_authorization for each statement execute function world_v2.social_demo_immutable();
-- Statement guards run before PostgreSQL obtains any target tuple lock, including
-- absent-row predicates. Row triggers alone cannot establish source-first order.
create function world_v2.social_demo_authority_statement_anchor() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$ begin
  perform 1 from world_v2.social_demo_source_scope where simulation_id='SINGLE_SOCIAL_OFFICE_SIM_V1' and world_id='WORLD_SOCIAL_SINGLE_DEMO_V1' and country_id='COUNTRY_01' for update;
  if not found then raise exception 'SOCIAL_AUTHORITY_ANCHOR_REQUIRED'; end if;
  return null;
end $$;
create trigger social_demo_manual_statement_first before insert or update or delete on world_v2.current_commit_authorization for each statement execute function world_v2.social_demo_authority_statement_anchor();
create trigger social_demo_seat_statement_first before insert or update or delete on world_v2.runtime_read_seat for each statement execute function world_v2.social_demo_authority_statement_anchor();
create trigger social_demo_auto_statement_first before insert or update or delete on world_v2.social_demo_automatic_authorization for each statement execute function world_v2.social_demo_authority_statement_anchor();

create function world_v2.social_demo_fixed_scope(s text,w text,c text) returns void
language plpgsql security definer set search_path=pg_catalog as $$ begin
  if s is distinct from 'SINGLE_SOCIAL_OFFICE_SIM_V1' or w is distinct from 'WORLD_SOCIAL_SINGLE_DEMO_V1' or c is distinct from 'COUNTRY_01' then raise exception 'SOCIAL_FIXED_SCOPE'; end if;
  perform 1 from world_v2.social_demo_source_scope where simulation_id=s and world_id=w and country_id=c and source_class='SIMULATED_OPENING' for share;
  if not found then raise exception 'SOCIAL_SOURCE_ANCHOR_REQUIRED'; end if;
end $$;

create function world_v2.social_demo_locked_manual_authority(s text,w text,c text,subject uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare rows_value jsonb; seats_value jsonb;
begin
  perform world_v2.social_demo_fixed_scope(s,w,c);
  if subject is distinct from '7f1c4f94-75b4-4876-a741-50bd31e14b21'::uuid then raise exception 'SOCIAL_FIXED_SUBJECT'; end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.capability),'[]'::jsonb) into rows_value from
    (select * from world_v2.current_commit_authorization where world_id=w and country_id=c and auth_subject=subject and office_id='SOCIAL' order by capability for share) a;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.seat_ref),'[]'::jsonb) into seats_value from
    (select * from world_v2.runtime_read_seat where world_id=w and country_id=c and auth_subject=subject and office_id='SOCIAL' order by seat_ref for share) a;
  return jsonb_build_object('rows',rows_value,'seats',seats_value);
end $$;
create function world_v2.social_demo_locked_automatic_authority(s text,w text,c text,issuer text,version text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
  perform world_v2.social_demo_fixed_scope(s,w,c);
  if issuer is distinct from 'SIMULATED_DUE_MATCH_PUBLISHER_V1' or version is distinct from 'SIM_SOCIAL_DUE_PUBLISHER_VERSION_V1' then raise exception 'SOCIAL_FIXED_PUBLISHER'; end if;
  select to_jsonb(a) into result from
    (select * from world_v2.social_demo_automatic_authorization where simulation_id=s and world_id=w and country_id=c and issuer_ref=issuer and publisher_version=version for share) a;
  return result;
end $$;

create function world_v2.social_demo_revise_manual_authority(p jsonb) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare n integer;
begin
  if not world_v2.social_demo_closed(p,array['simulationId','worldId','countryId','authSubject','expectedAuthorizationVersion','nextAuthorizationVersion','active','observedAtReal']) or jsonb_typeof(p->'active') is distinct from 'boolean' or coalesce(p->>'nextAuthorizationVersion','')='' or p->>'nextAuthorizationVersion'=p->>'expectedAuthorizationVersion' or p->>'authSubject' is distinct from '7f1c4f94-75b4-4876-a741-50bd31e14b21' then raise exception 'SOCIAL_AUTHORITY_REVISION'; end if;
  if p->>'simulationId' is distinct from 'SINGLE_SOCIAL_OFFICE_SIM_V1' or p->>'worldId' is distinct from 'WORLD_SOCIAL_SINGLE_DEMO_V1' or p->>'countryId' is distinct from 'COUNTRY_01' then raise exception 'SOCIAL_FIXED_SCOPE'; end if;
  perform 1 from world_v2.social_demo_source_scope where simulation_id=p->>'simulationId' and world_id=p->>'worldId' and country_id=p->>'countryId' for update;
  if (select count(*) from world_v2.current_commit_authorization where world_id=p->>'worldId' and country_id=p->>'countryId' and auth_subject=(p->>'authSubject')::uuid and office_id='SOCIAL' and team_id='TEAM_SOCIAL_SINGLE_DEMO_V1' and capability in ('READ_AUTHORIZED_PROJECTION_AND_FINAL','SOCIAL_LABOUR','SOCIAL_EDUCATION','SOCIAL_DEVELOPMENT') and authorization_version=p->>'expectedAuthorizationVersion')<>4 then raise exception 'SOCIAL_AUTHORITY_CAS'; end if;
  update world_v2.current_commit_authorization set active=(p->>'active')::boolean,authorization_version=p->>'nextAuthorizationVersion',refreshed_at_real=(p->>'observedAtReal')::timestamptz where world_id=p->>'worldId' and country_id=p->>'countryId' and auth_subject=(p->>'authSubject')::uuid and office_id='SOCIAL' and team_id='TEAM_SOCIAL_SINGLE_DEMO_V1' and capability in ('READ_AUTHORIZED_PROJECTION_AND_FINAL','SOCIAL_LABOUR','SOCIAL_EDUCATION','SOCIAL_DEVELOPMENT') and authorization_version=p->>'expectedAuthorizationVersion';
  get diagnostics n=row_count; if n<>4 then raise exception 'SOCIAL_AUTHORITY_CAS'; end if;
  if (p->>'active')::boolean then
    insert into world_v2.runtime_read_seat(seat_ref,world_id,auth_subject,country_id,office_id,team_id,authorization_revision,created_at_real)
    values('SIM_SOCIAL_SEAT_'||upper(world_v2.authoritative_sha256(p->>'nextAuthorizationVersion')),p->>'worldId',(p->>'authSubject')::uuid,p->>'countryId','SOCIAL','TEAM_SOCIAL_SINGLE_DEMO_V1',p->>'nextAuthorizationVersion',(p->>'observedAtReal')::timestamptz);
  end if;
end $$;
create function world_v2.social_demo_revise_automatic_authority(p jsonb) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare n integer;
begin
  if not world_v2.social_demo_closed(p,array['simulationId','worldId','countryId','issuerRef','expectedAuthorizationVersion','nextAuthorizationVersion','active','observedAtReal']) or jsonb_typeof(p->'active') is distinct from 'boolean' or coalesce(p->>'nextAuthorizationVersion','')='' or p->>'nextAuthorizationVersion'=p->>'expectedAuthorizationVersion' or p->>'issuerRef' is distinct from 'SIMULATED_DUE_MATCH_PUBLISHER_V1' then raise exception 'SOCIAL_AUTO_REVISION'; end if;
  if p->>'simulationId' is distinct from 'SINGLE_SOCIAL_OFFICE_SIM_V1' or p->>'worldId' is distinct from 'WORLD_SOCIAL_SINGLE_DEMO_V1' or p->>'countryId' is distinct from 'COUNTRY_01' then raise exception 'SOCIAL_FIXED_SCOPE'; end if;
  perform 1 from world_v2.social_demo_source_scope where simulation_id=p->>'simulationId' and world_id=p->>'worldId' and country_id=p->>'countryId' for update;
  update world_v2.social_demo_automatic_authorization set active=(p->>'active')::boolean,authorization_version=p->>'nextAuthorizationVersion' where simulation_id=p->>'simulationId' and world_id=p->>'worldId' and country_id=p->>'countryId' and issuer_ref=p->>'issuerRef' and authorization_version=p->>'expectedAuthorizationVersion';
  get diagnostics n=row_count; if n<>1 then raise exception 'SOCIAL_AUTO_CAS'; end if;
end $$;

-- Enforce the finite private host controller sequence on every publisher, including direct inserts.
create function world_v2.social_demo_finite_preset() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare p jsonb; previous jsonb; current_day text; prior_day text; r jsonb;
begin
  if new.world_id<>'WORLD_SOCIAL_SINGLE_DEMO_V1' then return new; end if;
  perform 1 from world_v2.social_demo_source_scope where simulation_id=new.simulation_id and world_id=new.world_id and country_id=new.country_id for update;
  if not found then raise exception 'SOCIAL_SOURCE_ANCHOR_REQUIRED'; end if;
  p:=new.publication_utf8::jsonb;
  select (v->>'rawUtf8')::jsonb into r from jsonb_array_elements(p->'records') v where v->>'recordId' like 'G_SOCIAL_ASOF_DAY_%' and p->'selectedRecordIds' ? (v->>'recordId');
  if r is null or not world_v2.social_demo_closed(r,array['schemaVersion','sourceClass','simulationId','worldId','countryId','locationId','presetId','dayIndex','simTime','selectionFingerprint']) then raise exception 'SOCIAL_ASOF_CLOSED'; end if;
  current_day:=r->>'dayIndex';
  if current_day not in ('0','1','10') or r->>'schemaVersion'<>'g-social-office-simulated-asof-v1' or r->>'sourceClass'<>'SIMULATED_OPENING' or r->>'simulationId'<>new.simulation_id or r->>'worldId'<>new.world_id or r->>'countryId'<>new.country_id or r->>'locationId'<>'REGION_01_E1' or r->>'presetId'<>'G_SOCIAL_PRESET_DAY_'||current_day or r->>'simTime'<>(current_day::bigint*86400000)::text or r->>'selectionFingerprint'<>'sha256:b7ff5facc4e3301d265279762d18cec18a5258dfa061ea88cffb4a03693e8036' then raise exception 'SOCIAL_ASOF_SCOPE'; end if;
  select publication_utf8::jsonb into previous from world_v2.social_demo_source_revision where simulation_id=new.simulation_id and world_id=new.world_id and country_id=new.country_id order by generation desc limit 1;
  if previous is null then if current_day<>'0' then raise exception 'SOCIAL_ASOF_INITIAL'; end if;
  else
    select (v->>'rawUtf8')::jsonb->>'dayIndex' into prior_day from jsonb_array_elements(previous->'records') v where v->>'recordId' like 'G_SOCIAL_ASOF_DAY_%' and previous->'selectedRecordIds' ? (v->>'recordId');
    if not(current_day=prior_day or (prior_day='0' and current_day='1') or (prior_day='1' and current_day='10')) then raise exception 'SOCIAL_ASOF_ORDER'; end if;
  end if;
  return new;
end $$;
create trigger social_demo_preset_sequence before insert on world_v2.social_demo_source_revision for each row execute function world_v2.social_demo_finite_preset();

-- Keep all existing movement/production validation byte-for-byte under its private legacy name.
alter function world_v2.validate_inventory_posting_payload(jsonb,world_v2.inventory_posting) rename to validate_inventory_before_social_demo;
create function world_v2.social_demo_validate_service_consumption(p jsonb,r world_v2.inventory_posting) returns void
language plpgsql set search_path=pg_catalog as $$
declare e world_v2.authoritative_event%rowtype; entry jsonb; ev jsonb;
begin
  if r.world_id<>'WORLD_SOCIAL_SINGLE_DEMO_V1' or not world_v2.social_demo_closed(p,array['schemaVersion','postingId','worldId','causationCommandId','causationEventIds','worldVersionBefore','worldVersionAfter','simTime','transitionBinding','operation','entries','evidence']) or p->>'schemaVersion'<>'inventory-social-service-consumption-v1' or p->>'operation'<>'SERVICE_CONSUME' or p->>'postingId' is distinct from r.posting_id or p->>'worldId' is distinct from r.world_id or p->>'causationCommandId' is distinct from r.causation_command_id or p->'causationEventIds' is distinct from r.event_ids or p->>'worldVersionBefore' is distinct from r.world_version_before::text or p->>'worldVersionAfter' is distinct from r.world_version_after::text or p->>'simTime' is distinct from r.sim_time::text or p->'transitionBinding' is distinct from r.transition_binding::jsonb then raise exception 'SOCIAL_SERVICE_ROW_BINDING'; end if;
  if jsonb_array_length(p->'entries')<>1 or jsonb_array_length(r.event_ids)<>1 then raise exception 'SOCIAL_SERVICE_ONE_EFFECT'; end if;
  entry:=p->'entries'->0; ev:=p->'evidence';
  if jsonb_typeof(p->'entries') is distinct from 'array' or not world_v2.social_demo_closed(entry,array['account','delta']) or not world_v2.social_demo_closed(entry->'delta',array['amount','unit']) or jsonb_typeof(entry->'delta'->'amount') is distinct from 'string' or (entry->'delta'->>'amount') !~ '^-[1-9][0-9]*$' or jsonb_typeof(entry->'delta'->'unit') is distinct from 'string' or entry->'account'->>'unit' is distinct from 'medical_dose' or entry->'account'->'reservationId' is distinct from 'null'::jsonb or entry->'account'->'shipmentId' is distinct from 'null'::jsonb then raise exception 'SOCIAL_SERVICE_ENTRY_SHAPE'; end if;
  if exists(select 1 from unnest(array['clinicId','careWindowId','serviceEventId','ruleVersion','medicineSourceRecordId','inventoryBeforeHash','financialBeforeHash','deliveredCases','dosesPerCase']) k where jsonb_typeof(ev->k) is distinct from 'string') or not world_v2.social_demo_uint(ev->>'deliveredCases') or not world_v2.social_demo_uint(ev->>'dosesPerCase') or not world_v2.social_demo_closed(ev->'consumption',array['account','quantity','unit']) or jsonb_typeof(ev->'consumption'->'quantity') is distinct from 'string' or not world_v2.social_demo_uint(ev->'consumption'->>'quantity') or ev->'consumption'->>'unit' is distinct from 'medical_dose' or jsonb_typeof(ev->'financialBatchFingerprints') is distinct from 'array' then raise exception 'SOCIAL_SERVICE_EVIDENCE_SHAPE'; end if;
  if not world_v2.social_demo_closed(ev,array['clinicId','careWindowId','serviceEventId','ruleVersion','medicineSourceRecordId','inventoryBeforeHash','financialBeforeHash','deliveredCases','dosesPerCase','consumption','financialRequirement','financialBatchFingerprints']) or entry->'account'->>'bucket'<>'AVAILABLE' or entry->'delta'->>'unit'<>'medical_dose' or (entry->'delta'->>'amount')::numeric>=0 or entry->'account'->>'worldId'<>r.world_id or entry->'account'->>'countryId'<>'COUNTRY_01' or ev->>'serviceEventId' is distinct from r.event_ids->>0 or ev->>'inventoryBeforeHash' !~ '^sha256:[a-f0-9]{64}$' or ev->>'financialBeforeHash' !~ '^sha256:[a-f0-9]{64}$' or (ev->>'deliveredCases')::numeric<=0 or (ev->>'dosesPerCase')::numeric<=0 or -(entry->'delta'->>'amount')::numeric<>(ev->>'deliveredCases')::numeric*(ev->>'dosesPerCase')::numeric or entry->'account' is distinct from ev->'consumption'->'account' or -(entry->'delta'->>'amount')::numeric<>(ev->'consumption'->>'quantity')::numeric then raise exception 'SOCIAL_SERVICE_MEDICINE'; end if;
  select * into e from world_v2.authoritative_event where world_id=r.world_id and event_id=ev->>'serviceEventId' and causation_command_id=r.causation_command_id and world_version=r.world_version_after;
  if not found or e.event_type<>'SOCIAL_OFFICE_ACTION_APPLIED_V1' or e.corrects_event_id is not null or e.sim_time<>r.sim_time or (e.canonical_payload::jsonb)->'result'->>'kind'<>'SERVE' or (e.canonical_payload::jsonb)->'result'->'inventoryRequirement' is distinct from ev->'consumption' or (e.canonical_payload::jsonb)->'result'->'financialRequirement' is distinct from ev->'financialRequirement' or (e.canonical_payload::jsonb)->'result'->>'units' is distinct from ev->>'deliveredCases' then raise exception 'SOCIAL_SERVICE_FULL_EVENT'; end if;
end $$;
create function world_v2.validate_inventory_posting_payload(payload jsonb,row_value world_v2.inventory_posting) returns void
language plpgsql security definer set search_path=pg_catalog as $$ begin
  if row_value.operation='SERVICE_CONSUME' then perform world_v2.social_demo_validate_service_consumption(payload,row_value);
  else perform world_v2.validate_inventory_before_social_demo(payload,row_value); end if;
end $$;
alter table world_v2.inventory_posting drop constraint inventory_posting_operation_check;
alter table world_v2.inventory_posting add constraint inventory_posting_operation_check check(operation in ('RESERVE','RELEASE','SHIP','DELIVER','PRODUCE_AND_CONSUME','SERVICE_CONSUME'));
create unique index social_demo_service_event_once on world_v2.inventory_posting(world_id,((canonical_payload::jsonb)->'evidence'->>'serviceEventId')) where operation='SERVICE_CONSUME';
create function world_v2.social_demo_service_final() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare expected jsonb;
begin
  if new.operation<>'SERVICE_CONSUME' then return null; end if;
  if not exists(select 1 from world_v2.command_receipt where world_id=new.world_id and command_id=new.causation_command_id and outcome='COMMITTED' and world_version_before=new.world_version_before and world_version_after=new.world_version_after and event_ids=new.event_ids) then raise exception 'SOCIAL_SERVICE_FINAL_RECEIPT'; end if;
  select coalesce(jsonb_agg(batch_fingerprint order by batch_id),'[]'::jsonb) into expected from world_v2.financial_posting_batch where world_id=new.world_id and causation_command_id=new.causation_command_id;
  if expected is distinct from (new.canonical_payload::jsonb)->'evidence'->'financialBatchFingerprints' then raise exception 'SOCIAL_SERVICE_FULL_FINANCIAL_GROUP'; end if;
  return null;
end $$;
create constraint trigger social_demo_service_final_receipt after insert on world_v2.inventory_posting deferrable initially deferred for each row execute function world_v2.social_demo_service_final();

-- No implicit PUBLIC API. F grants the fixed functions only to their separate owned roles.
create function world_v2.social_demo_lease_control(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
  if not world_v2.social_demo_closed(p,array['worldId','holderId','observedAtReal','leaseDurationMilliseconds']) or p->>'worldId' is distinct from 'WORLD_SOCIAL_SINGLE_DEMO_V1' or p->>'holderId' is distinct from 'SOCIAL_DEMO_WORKER_V1' or not world_v2.social_demo_uint(p->>'leaseDurationMilliseconds') or (p->>'leaseDurationMilliseconds')::bigint not between 1 and 300000 then raise exception 'SOCIAL_LEASE_FIXED_SCOPE'; end if;
  select to_jsonb(v) into result from world_v2.acquire_world_writer_lease(p->>'worldId',p->>'holderId',(p->>'observedAtReal')::timestamptz,(p->>'leaseDurationMilliseconds')::bigint) v;
  return result;
end $$;
revoke all on function world_v2.social_demo_lease_control(jsonb) from public;
revoke all on world_v2.social_demo_automatic_authorization from public;
revoke all on function world_v2.social_demo_authority_anchor(),world_v2.social_demo_fixed_scope(text,text,text),world_v2.social_demo_locked_manual_authority(text,text,text,uuid),world_v2.social_demo_locked_automatic_authority(text,text,text,text,text),world_v2.social_demo_revise_manual_authority(jsonb),world_v2.social_demo_revise_automatic_authority(jsonb),world_v2.social_demo_finite_preset(),world_v2.social_demo_validate_service_consumption(jsonb,world_v2.inventory_posting),world_v2.social_demo_service_final() from public;
