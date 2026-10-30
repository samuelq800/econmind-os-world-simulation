-- Candidate source custody only. Not in the migration manifest; no role
-- memberships, securities, quotes, source admissions or World writes created.
-- Prerequisites: existing atomic facts, opening seed, runtime admission/permit,
-- current authorization and immutable-history triggers. Independent admission
-- rows are supplied by a separately authorized issuer, never this publisher.
begin;
do $$declare n text;begin foreach n in array array['world_v2_cb_omo_source_owner','world_v2_cb_omo_source_publisher','world_v2_cb_omo_source_reader']loop
 if not exists(select 1 from pg_roles where rolname=n)then execute format('create role %I nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',n);end if;
 if exists(select 1 from pg_roles where rolname=n and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'CB_OMO_UNSAFE_FIXED_ROLE' using errcode='42501';end if;
end loop;end;$$;
grant usage,create on schema world_v2 to world_v2_cb_omo_source_owner;
grant usage on schema world_v2 to world_v2_cb_omo_source_publisher,world_v2_cb_omo_source_reader;
create table world_v2.central_bank_omo_adoption(
 adoption_ref text primary key,world_id text not null,country_id text not null,
 seed_id text not null,seed_fingerprint text not null,admission_ref text not null,
 admission_revision text not null,issuer_ref text not null,custodian_ref text not null,
 source_ref text not null,source_revision text not null,
 source_class text not null check(source_class in('ADMITTED_ORIGINAL','TEST_ONLY')),
 admission_evidence_sha256 text not null check(admission_evidence_sha256~'^[a-f0-9]{64}$'),
 original_sha256 text not null check(original_sha256~'^[a-f0-9]{64}$'),
 unique(world_id,country_id),
 foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint),
 foreign key(admission_ref)references world_v2.runtime_opening_admission(admission_ref)
);
create table world_v2.central_bank_omo_quote_adoption(
 adoption_ref text not null references world_v2.central_bank_omo_adoption(adoption_ref),
 quote_ref text not null,quote_sha256 text not null check(quote_sha256~'^[a-f0-9]{64}$'),
 admission_evidence_sha256 text not null check(admission_evidence_sha256~'^[a-f0-9]{64}$'),
 primary key(adoption_ref,quote_ref)
);
create table world_v2.central_bank_omo_original(
 adoption_ref text primary key references world_v2.central_bank_omo_adoption(adoption_ref),
 original_text text not null check(octet_length(original_text)<=262144),
 original_sha256 text not null check(original_sha256=encode(sha256(convert_to(original_text,'UTF8')),'hex')),
 canonical_seed_sha256 text not null check(canonical_seed_sha256~'^[a-f0-9]{64}$')
);
create table world_v2.central_bank_omo_quote(
 adoption_ref text not null,quote_ref text not null,security_ref text not null,batch_ref text not null,
 world_version bigint not null check(world_version>=0),valid_at_sim_time bigint not null check(valid_at_sim_time>=0),
 quote_text text not null check(octet_length(quote_text)<=16384),
 quote_sha256 text not null check(quote_sha256=encode(sha256(convert_to(quote_text,'UTF8')),'hex')),
 primary key(adoption_ref,quote_ref),unique(adoption_ref,security_ref,batch_ref,world_version,valid_at_sim_time),
 foreign key(adoption_ref,quote_ref)references world_v2.central_bank_omo_quote_adoption(adoption_ref,quote_ref)
);
create table world_v2.central_bank_omo_revocation(
 adoption_ref text not null references world_v2.central_bank_omo_adoption(adoption_ref),
 resource_ref text not null,reason_ref text not null check(length(reason_ref)between 1 and 256),
 revoked_at timestamptz not null default clock_timestamp(),primary key(adoption_ref,resource_ref)
);
do $$declare t text;begin foreach t in array array['central_bank_omo_adoption','central_bank_omo_quote_adoption','central_bank_omo_original','central_bank_omo_quote','central_bank_omo_revocation']loop
 execute format('alter table world_v2.%I owner to world_v2_cb_omo_source_owner',t);
 execute format('revoke all on world_v2.%I from public',t);
 execute format('create trigger cb_omo_immutable before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t);
 execute format('create trigger cb_omo_no_truncate before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t);
end loop;end;$$;
-- The inaccessible owner is the sole table reader; live readers get EXEC only.
grant select on world_v2.world_head,world_v2.opening_seed,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.current_commit_authorization,world_v2.world_writer_lease,world_v2.authoritative_event,world_v2.command_submission,world_v2.command_receipt,world_v2.financial_posting_batch,world_v2.inventory_posting to world_v2_cb_omo_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_cb_omo_source_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_cb_omo_source_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_cb_omo_source_owner;
grant update(authorization_version)on world_v2.current_commit_authorization to world_v2_cb_omo_source_owner;
grant update(fencing_token)on world_v2.world_writer_lease to world_v2_cb_omo_source_owner;
-- Lock-only UPDATE grants are never usable for DML through the owner policy.
do $$declare t text;begin
 foreach t in array array['world_head','opening_seed','runtime_opening_admission','current_commit_authorization','authoritative_event','command_submission','command_receipt','financial_posting_batch','inventory_posting']loop
  execute format('create policy cb_omo_owner_read on world_v2.%I for select to world_v2_cb_omo_source_owner using(current_user=''world_v2_cb_omo_source_owner''and world_id=current_setting(''econmind.cb_omo_world'',true))',t);
  execute format('create policy cb_omo_owner_fence on world_v2.%I as restrictive for select to world_v2_cb_omo_source_owner using(current_user=''world_v2_cb_omo_source_owner''and world_id=current_setting(''econmind.cb_omo_world'',true))',t);
 end loop;
 foreach t in array array['world_head','runtime_opening_admission','current_commit_authorization']loop
  execute format('create policy cb_omo_owner_lock on world_v2.%I for update to world_v2_cb_omo_source_owner using(current_user=''world_v2_cb_omo_source_owner''and world_id=current_setting(''econmind.cb_omo_world'',true))with check(false)',t);
 end loop;
end;$$;
create function world_v2.cb_omo_require_role(p_kind text)returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare effective name;required name;opposite name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case p_kind when 'READER'then 'world_v2_cb_omo_source_reader'when 'PUBLISHER'then 'world_v2_cb_omo_source_publisher'else null end;
 opposite:=case p_kind when 'READER'then 'world_v2_cb_omo_source_publisher'else 'world_v2_cb_omo_source_reader'end;
 if required is null or not pg_has_role(effective,required,'MEMBER')or pg_has_role(effective,'world_v2_cb_omo_source_owner','MEMBER')or pg_has_role(effective,opposite,'MEMBER')or exists(select 1 from pg_roles where rolname=effective and(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'CB_OMO_FIXED_SEPARATED_ROLE_REQUIRED' using errcode='42501';end if;
end;$$;
create function world_v2.cb_omo_admission(p_world text)returns world_v2.runtime_opening_admission language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;p world_v2.runtime_admission_publication_permit%rowtype;begin
 perform set_config('econmind.cb_omo_world',p_world,true);
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found then raise exception 'CB_OMO_ACTUAL_RUNTIME_ADMISSION_REQUIRED' using errcode='55000';end if;
 select * into p from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation x where x.authorization_id=p.authorization_id)then raise exception 'CB_OMO_ADMISSION_REVOKED_OR_MISSING' using errcode='55000';end if;
 if not exists(select 1 from world_v2.opening_seed s where s.world_id=a.world_id and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.replay_binding=a.replay_binding and s.opening_world_version=0)then raise exception 'CB_OMO_IMMUTABLE_OPENING_REQUIRED' using errcode='55000';end if;
 return a;
end;$$;
-- All inserts of child originals/adoptions/revocations conflict with held parent
-- SHARE locks, including a direct independently authorized owner insert.
create function world_v2.cb_omo_parent_lock()returns trigger language plpgsql security invoker as $$begin
 perform 1 from world_v2.central_bank_omo_adoption a where a.adoption_ref=new.adoption_ref for update;
 if not found then raise exception 'CB_OMO_ADOPTED_PARENT_REQUIRED' using errcode='23514';end if;return new;end;$$;
do $$declare t text;begin foreach t in array array['central_bank_omo_quote_adoption','central_bank_omo_original','central_bank_omo_quote','central_bank_omo_revocation']loop
 execute format('create trigger cb_omo_parent before insert on world_v2.%I for each row execute function world_v2.cb_omo_parent_lock()',t);
end loop;end;$$;
create function world_v2.publish_central_bank_omo_originals(p_ref text,p_original text,p_quote text)returns void language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.central_bank_omo_adoption%rowtype;qa world_v2.central_bank_omo_quote_adoption%rowtype;ad world_v2.runtime_opening_admission%rowtype;o jsonb;q jsonb;raw_sha text;begin
 perform world_v2.cb_omo_require_role('PUBLISHER');
 if octet_length(p_original)>262144 or octet_length(p_quote)>16384 then raise exception 'CB_OMO_ORIGINAL_CAPACITY_EXCEEDED' using errcode='54000';end if;
 -- Immutable lookup locates the world; the held ordering is admission before
 -- adopted source, matching the online reader. No source lock precedes admission.
 select * into a from world_v2.central_bank_omo_adoption x where x.adoption_ref=p_ref;
 if not found then raise exception 'CB_OMO_INDEPENDENT_SOURCE_ADOPTION_REQUIRED' using errcode='55000';end if;
 ad:=world_v2.cb_omo_admission(a.world_id);
 select * into a from world_v2.central_bank_omo_adoption x where x.adoption_ref=p_ref for update;
 if ad.admission_ref<>a.admission_ref or ad.seed_id<>a.seed_id or ad.seed_fingerprint<>a.seed_fingerprint or exists(select 1 from world_v2.central_bank_omo_revocation x where x.adoption_ref=p_ref and x.resource_ref='SOURCE')then raise exception 'CB_OMO_SOURCE_REVOKED_OR_DIFFERENT' using errcode='55000';end if;
 o:=p_original::jsonb;q:=p_quote::jsonb;
 select * into qa from world_v2.central_bank_omo_quote_adoption x where x.adoption_ref=p_ref and x.quote_ref=q->>'quoteRef'for share;
 if not found or qa.quote_sha256<>encode(sha256(convert_to(p_quote,'UTF8')),'hex')or a.original_sha256<>encode(sha256(convert_to(p_original,'UTF8')),'hex')then raise exception 'CB_OMO_INDEPENDENT_EXACT_QUOTE_ADOPTION_REQUIRED' using errcode='55000';end if;
 if o->>'schemaVersion'<>'central-bank-omo-original-v1'or o->>'worldId'<>a.world_id or o->>'countryId'<>a.country_id or o->>'seedFingerprint'<>a.seed_fingerprint or o->>'sourceRef'<>a.source_ref or o->>'sourceRevision'<>a.source_revision or q->>'sourceRef'<>a.source_ref or q->>'issuerRef'<>o->>'domesticTreasuryRef'or q->>'worldVersion'!~'^(0|[1-9][0-9]*)$'or q->>'validAtSimTime'!~'^(0|[1-9][0-9]*)$'then raise exception 'CB_OMO_EXACT_ORIGINAL_SCOPE_REQUIRED' using errcode='23514';end if;
 select encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex')into raw_sha from world_v2.opening_seed s where s.world_id=a.world_id;
 if exists(select 1 from world_v2.central_bank_omo_original x where x.adoption_ref=p_ref and(x.original_text<>p_original or x.canonical_seed_sha256<>raw_sha))then raise exception 'CB_OMO_IMMUTABLE_ORIGINAL_CONFLICT' using errcode='23514';end if;
 insert into world_v2.central_bank_omo_original values(p_ref,p_original,a.original_sha256,raw_sha)on conflict do nothing;
 if exists(select 1 from world_v2.central_bank_omo_quote x where x.adoption_ref=p_ref and x.quote_ref=q->>'quoteRef'and x.quote_text<>p_quote)then raise exception 'CB_OMO_IMMUTABLE_QUOTE_CONFLICT' using errcode='23514';end if;
 insert into world_v2.central_bank_omo_quote values(p_ref,q->>'quoteRef',q->>'securityRef',q->>'batchRef',(q->>'worldVersion')::bigint,(q->>'validAtSimTime')::bigint,p_quote,qa.quote_sha256)on conflict do nothing;
end;$$;
create function world_v2.lock_central_bank_omo_startup_header(p_world text,p_country text)
returns table(seed_id text,seed_fingerprint text,replay_binding text,canonical_seed_sha256 text)
language plpgsql security definer set search_path=pg_catalog as $$
declare ad world_v2.runtime_opening_admission%rowtype;a world_v2.central_bank_omo_adoption%rowtype;begin
 perform world_v2.cb_omo_require_role('READER');ad:=world_v2.cb_omo_admission(p_world);
 select * into a from world_v2.central_bank_omo_adoption x where x.world_id=p_world and x.country_id=p_country and x.admission_ref=ad.admission_ref and x.seed_fingerprint=ad.seed_fingerprint for share;
 if not found or exists(select 1 from world_v2.central_bank_omo_revocation x where x.adoption_ref=a.adoption_ref and x.resource_ref='SOURCE')then raise exception 'CB_OMO_INDEPENDENT_SOURCE_ADOPTION_REQUIRED' using errcode='55000';end if;
 return query select s.seed_id,s.seed_fingerprint,s.replay_binding,encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex')from world_v2.opening_seed s where s.world_id=p_world and s.seed_fingerprint=ad.seed_fingerprint;
end;$$;
create function world_v2.lock_central_bank_omo_originals(p_world text,p_country text,p_security text,p_batch text,p_worker text,p_at timestamptz,p_subject uuid,p_sim_time text)
returns table(adoption_ref text,admission_ref text,admission_revision text,source_ref text,source_revision text,source_class text,original_text text,original_sha256 text,quote_text text,quote_sha256 text,seed_fingerprint text,canonical_seed_sha256 text,world_version text,event_sequence text,team_id text,authorization_version text,fencing_token text,acquired_at_real text,renewed_at_real text,lease_expires_at_real text,events jsonb,commands jsonb,receipts jsonb,financial_batches jsonb,historical_quotes jsonb,financial_batch_count text,inventory_posting_count text)
language plpgsql security definer set search_path=pg_catalog as $$
declare ad world_v2.runtime_opening_admission%rowtype;a world_v2.central_bank_omo_adoption%rowtype;o world_v2.central_bank_omo_original%rowtype;q world_v2.central_bank_omo_quote%rowtype;l world_v2.world_writer_lease%rowtype;au world_v2.current_commit_authorization%rowtype;h world_v2.world_head%rowtype;begin
 perform world_v2.cb_omo_require_role('READER');perform set_config('econmind.cb_omo_world',p_world,true);
 if p_at is null or not isfinite(p_at)then raise exception 'CB_OMO_EXACT_OBSERVATION_REQUIRED' using errcode='22023';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'CB_OMO_WORLD_HEAD_REQUIRED' using errcode='55000';end if;
 if h.world_version>256 or h.event_sequence>256 then raise exception 'CB_OMO_PREFIX_CAPACITY_EXCEEDED' using errcode='54000';end if;
 select * into l from world_v2.world_writer_lease x where x.world_id=p_world and x.holder_id=p_worker and x.acquired_at_real<=p_at and x.renewed_at_real<=p_at and x.lease_expires_at_real>p_at for share;
 if not found then raise exception 'CB_OMO_CURRENT_WRITER_LEASE_REQUIRED' using errcode='55000';end if;
 ad:=world_v2.cb_omo_admission(p_world);
 select * into a from world_v2.central_bank_omo_adoption x where x.world_id=p_world and x.country_id=p_country and x.admission_ref=ad.admission_ref and x.seed_fingerprint=ad.seed_fingerprint for share;
 if not found then raise exception 'CB_OMO_INDEPENDENT_SOURCE_ADOPTION_REQUIRED' using errcode='55000';end if;
 if exists(select 1 from world_v2.central_bank_omo_revocation x where x.adoption_ref=a.adoption_ref and x.resource_ref='SOURCE')then raise exception 'CB_OMO_SOURCE_REVOKED' using errcode='55000';end if;
 select * into o from world_v2.central_bank_omo_original x where x.adoption_ref=a.adoption_ref for share;
 if not found then raise exception 'CB_OMO_REGISTERED_ORIGINAL_REQUIRED' using errcode='55000';end if;
 select * into q from world_v2.central_bank_omo_quote x where x.adoption_ref=a.adoption_ref and x.security_ref=p_security and x.batch_ref=p_batch and x.world_version=h.world_version and x.valid_at_sim_time::text=p_sim_time for share;
 if not found then raise exception 'CB_OMO_CURRENT_ADOPTED_QUOTE_REQUIRED' using errcode='55000';end if;
 if exists(select 1 from world_v2.central_bank_omo_revocation x where x.adoption_ref=a.adoption_ref and x.resource_ref=q.quote_ref)then raise exception 'CB_OMO_QUOTE_REVOKED' using errcode='55000';end if;
 select * into au from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.country_id=p_country and x.office_id='CENTRAL_BANK'and x.capability='CENTRAL_BANK_MONETARY_POLICY'and x.active for share;
 if not found or exists(select 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.active and(x.country_id<>au.country_id or x.team_id<>au.team_id or x.authorization_version<>au.authorization_version))then raise exception 'CB_OMO_CURRENT_EXACT_AUTHORIZATION_REQUIRED' using errcode='42501';end if;
 if exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world)then raise exception 'CB_OMO_UNINSTALLED_INVENTORY_EFFECT' using errcode='55000';end if;
 if (select count(*)from world_v2.authoritative_event x where x.world_id=p_world)<>h.event_sequence or(select count(*)from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED')<>h.world_version then raise exception 'CB_OMO_COMPLETE_PREFIX_REQUIRED' using errcode='55000';end if;
 -- DATA shape, never a no-effect classification. The existing OMO-only
 -- reducer still requires one event/batch per version. A genuine H0 prepared
 -- Core mixed replay may validate the complete other registered families.
 select count(*)::text into financial_batch_count from world_v2.financial_posting_batch x where x.world_id=p_world;
 inventory_posting_count:='0';
 if financial_batch_count::bigint>512 then raise exception 'CB_OMO_PREFIX_BATCH_CAPACITY_EXCEEDED'using errcode='54000';end if;
 -- Deny oversized rows before constructing any aggregate; bounded head alone
 -- does not bound serialized command/event/receipt/journal bytes.
 if exists(select 1 from world_v2.authoritative_event x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)
 or exists(select 1 from world_v2.financial_posting_batch x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)
 or exists(select 1 from world_v2.command_submission x where x.world_id=p_world and x.command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select r.command_id from world_v2.command_receipt r where r.world_id=p_world and r.outcome='COMMITTED') and octet_length(x.canonical_payload)>16384)
 or(select count(*)from world_v2.central_bank_omo_quote x where x.adoption_ref=a.adoption_ref)>256
 or(select coalesce(sum(octet_length(x.quote_text)),0)from world_v2.central_bank_omo_quote x where x.adoption_ref=a.adoption_ref)>1048576
 then raise exception 'CB_OMO_PREFIX_ROW_BYTE_CAPACITY_EXCEEDED' using errcode='54000';end if;
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('world_version',x.world_version::text,'sequence',x.event_sequence::text,'sim_time',x.sim_time::text,'recorded_at_real',to_char(x.recorded_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))order by x.event_sequence),'[]'::jsonb)into events from world_v2.authoritative_event x where x.world_id=p_world;
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('expected_world_version',x.expected_world_version::text,'sim_time',x.sim_time::text,'submitted_at_real',to_char(x.submitted_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))order by x.command_id),'[]'::jsonb)into commands from world_v2.command_submission x where x.world_id=p_world and x.command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select r.command_id from world_v2.command_receipt r where r.world_id=p_world and r.outcome='COMMITTED');
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('world_version_before',x.world_version_before::text,'world_version_after',x.world_version_after::text,'sim_time',x.sim_time::text,'recorded_at_real',to_char(x.recorded_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))order by x.world_version_after),'[]'::jsonb)into receipts from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED';
 select coalesce(jsonb_agg(jsonb_build_object('batch_id',x.batch_id,'causation_command_id',x.causation_command_id,'canonical_payload',x.canonical_payload,'fingerprint',x.batch_fingerprint)order by x.batch_id),'[]'::jsonb)into financial_batches from world_v2.financial_posting_batch x where x.world_id=p_world;
 select coalesce(jsonb_agg(jsonb_build_object('quote_text',x.quote_text,'quote_sha256',x.quote_sha256)order by x.quote_ref),'[]'::jsonb)into historical_quotes from world_v2.central_bank_omo_quote x where x.adoption_ref=a.adoption_ref;
 if octet_length(events::text)+octet_length(commands::text)+octet_length(receipts::text)+octet_length(financial_batches::text)>1048576 or jsonb_array_length(historical_quotes)>256 then raise exception 'CB_OMO_COMPLETE_PREFIX_BYTE_CAPACITY_EXCEEDED' using errcode='54000';end if;
 adoption_ref:=a.adoption_ref;admission_ref:=a.admission_ref;admission_revision:=a.admission_revision;source_ref:=a.source_ref;source_revision:=a.source_revision;source_class:=a.source_class;original_text:=o.original_text;original_sha256:=o.original_sha256;quote_text:=q.quote_text;quote_sha256:=q.quote_sha256;seed_fingerprint:=a.seed_fingerprint;canonical_seed_sha256:=o.canonical_seed_sha256;world_version:=h.world_version::text;event_sequence:=h.event_sequence::text;team_id:=au.team_id;authorization_version:=au.authorization_version;fencing_token:=l.fencing_token::text;
 acquired_at_real:=to_char(l.acquired_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');renewed_at_real:=to_char(l.renewed_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');lease_expires_at_real:=to_char(l.lease_expires_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');return next;
end;$$;
create function world_v2.revoke_central_bank_omo_original(p_ref text,p_resource text,p_reason text)returns void language plpgsql security definer set search_path=pg_catalog as $$begin
 perform world_v2.cb_omo_require_role('PUBLISHER');
 perform 1 from world_v2.central_bank_omo_adoption x where x.adoption_ref=p_ref for update;
 if not found or(p_resource<>'SOURCE'and not exists(select 1 from world_v2.central_bank_omo_quote x where x.adoption_ref=p_ref and x.quote_ref=p_resource))then raise exception 'CB_OMO_EXISTING_RESOURCE_REQUIRED' using errcode='23503';end if;
 insert into world_v2.central_bank_omo_revocation values(p_ref,p_resource,p_reason,clock_timestamp())on conflict do nothing;
end;$$;
do $$declare f regprocedure;begin
 foreach f in array array['world_v2.cb_omo_require_role(text)'::regprocedure,'world_v2.cb_omo_admission(text)'::regprocedure,'world_v2.cb_omo_parent_lock()'::regprocedure,'world_v2.publish_central_bank_omo_originals(text,text,text)'::regprocedure,'world_v2.lock_central_bank_omo_startup_header(text,text)'::regprocedure,'world_v2.lock_central_bank_omo_originals(text,text,text,text,text,timestamptz,uuid,text)'::regprocedure,'world_v2.revoke_central_bank_omo_original(text,text,text)'::regprocedure]loop
 execute format('alter function %s owner to world_v2_cb_omo_source_owner',f);
 execute format('revoke all on function %s from public',f);
 end loop;
end;$$;
grant execute on function world_v2.publish_central_bank_omo_originals(text,text,text),world_v2.revoke_central_bank_omo_original(text,text,text)to world_v2_cb_omo_source_publisher;
grant execute on function world_v2.lock_central_bank_omo_startup_header(text,text),world_v2.lock_central_bank_omo_originals(text,text,text,text,text,timestamptz,uuid,text)to world_v2_cb_omo_source_reader;
revoke create on schema world_v2 from world_v2_cb_omo_source_owner;
commit;
