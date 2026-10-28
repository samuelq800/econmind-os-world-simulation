-- Candidate only, not in the migration manifest. No account memberships,
-- opening admission, policy originals, budget balances or running writer are
-- installed. Publisher is a separate controlled source-publication capability.
-- Production enrollment remains separately reviewable: existing queue/commit
-- lease guards require the writer's scoped lease metadata row-lock privilege
-- (for example UPDATE(renewed_at_real), with exact-World RLS). This proposal
-- grants no worker/intake membership or lease/authority DML privilege. The
-- native evidence grants only an owned TEST_ONLY writer in its isolated clone.
begin;
do $$declare n text;begin foreach n in array array['world_v2_finance_budget_source_owner','world_v2_finance_budget_source_publisher','world_v2_finance_budget_source_reader']loop
 if not exists(select 1 from pg_roles where rolname=n)then execute format('create role %I nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',n);end if;
 if exists(select 1 from pg_roles where rolname=n and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'BUDGET_UNSAFE_FIXED_ROLE'using errcode='42501';end if;
end loop;end;$$;
grant usage,create on schema world_v2 to world_v2_finance_budget_source_owner;
grant usage on schema world_v2 to world_v2_finance_budget_source_reader,world_v2_finance_budget_source_publisher;
create table world_v2.finance_budget_policy_original(
 policy_ref text primary key,world_id text not null,country_id text not null,envelope_ref text not null,period_ref text not null,
 seed_fingerprint text not null,admission_ref text not null,issuer_ref text not null,
 policy_text text not null check(octet_length(policy_text)<=16384),
 policy_sha256 text not null check(policy_sha256=encode(sha256(convert_to(policy_text,'UTF8')),'hex')),
 normative_sha256 text not null check(normative_sha256~'^[a-f0-9]{64}$'),
 unique(world_id,country_id,envelope_ref,period_ref),foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint)
);
create table world_v2.finance_budget_policy_revocation(
 policy_ref text primary key references world_v2.finance_budget_policy_original(policy_ref),reason_ref text not null check(length(reason_ref)between 1 and 256),revoked_at timestamptz not null default clock_timestamp()
);
alter table world_v2.finance_budget_policy_original owner to world_v2_finance_budget_source_owner;
alter table world_v2.finance_budget_policy_revocation owner to world_v2_finance_budget_source_owner;
revoke all on world_v2.finance_budget_policy_original,world_v2.finance_budget_policy_revocation from public;
grant select on world_v2.world_head,world_v2.opening_seed,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.world_writer_lease to world_v2_finance_budget_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_finance_budget_source_owner;
grant update(fencing_token)on world_v2.world_writer_lease to world_v2_finance_budget_source_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_finance_budget_source_owner;
grant update(authorization_version)on world_v2.current_commit_authorization to world_v2_finance_budget_source_owner;
grant update(active)on world_v2.projection_entitlement to world_v2_finance_budget_source_owner;
-- Source owner sees canonical source only for controlled offline publication;
-- reader receives no SELECT on it or on original tables.
create policy budget_source_owner_seed on world_v2.opening_seed for select to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true));
create policy budget_source_owner_auth on world_v2.current_commit_authorization for select to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true));
create policy budget_source_owner_seat on world_v2.runtime_read_seat for select to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true));
create policy budget_source_owner_entitlement on world_v2.projection_entitlement for select to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true));
-- PostgreSQL FOR SHARE also applies UPDATE-USING RLS. Permit row locking,
-- while WITH CHECK false forbids an actual entitlement mutation.
create policy budget_source_owner_entitlement_lock on world_v2.projection_entitlement for update to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true)) with check(false);
create policy budget_source_owner_admission on world_v2.runtime_opening_admission for select to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true));
create function world_v2.finance_budget_original_immutable()returns trigger language plpgsql as $$begin raise exception 'BUDGET_ORIGINAL_APPEND_ONLY'using errcode='42501';end;$$;
create trigger budget_policy_immutable before update or delete on world_v2.finance_budget_policy_original for each row execute function world_v2.finance_budget_original_immutable();
create trigger budget_revocation_immutable before update or delete on world_v2.finance_budget_policy_revocation for each row execute function world_v2.finance_budget_original_immutable();
create function world_v2.publish_finance_budget_policy(p_ref text,p_issuer text,p_policy_text text,p_seed_fingerprint text,p_admission_ref text,p_normative_sha256 text)returns text language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;p jsonb;s world_v2.opening_seed%rowtype;a world_v2.runtime_opening_admission%rowtype;financial jsonb;roster jsonb;original jsonb;country jsonb;policy_hash text;prior world_v2.finance_budget_policy_original%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_finance_budget_source_publisher','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_reader','MEMBER')then raise exception 'BUDGET_CONTROLLED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if length(p_ref)not between 1 and 256 or length(p_issuer)not between 1 and 256 or octet_length(p_policy_text)>16384 then raise exception 'BUDGET_POLICY_IDENTIFIER_INVALID'using errcode='22023';end if;
 p:=p_policy_text::jsonb;
 perform set_config('econmind.finance_budget_source_world',p->>'worldId',true);
 if p->>'schemaVersion'<>'finance-native-budget-policy-v1'or p->>'ruleRef'<>'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1'or p->>'requestingOfficeId'<>'FINANCE'or p->>'programmeOwnerOfficeId'<>'FINANCE'or p->>'classification'<>'ORDINARY_DEPARTMENTAL'or p->>'funding'<>'FULL_UNCONDITIONAL'or p->'requiredApprovalOffices'<>'["FINANCE"]'::jsonb or p->>'sourceDocumentSHA256'<>'sha256:'||p_normative_sha256 or p->'normativeUnits'<>'["FINANCE-U0247","FINANCE-U0252","FINANCE-U0265","FINANCE-U0295"]'::jsonb then raise exception 'BUDGET_UNSUPPORTED_APPROVAL_RULE'using errcode='23514';end if;
 -- The caller must pin the independently reviewed extracted Finance original.
 -- No dynamic path, caller flags, fixture source class or rule substitution.
 if p_normative_sha256<>'6152e2c87a5545e1c354c8a6dbe8b948bbfcb3d396ef54624d9326d0bc1b8385' then raise exception 'BUDGET_NORMATIVE_ORIGINAL_PIN_MISMATCH'using errcode='23514';end if;
 select * into strict s from world_v2.opening_seed x where x.world_id=p->>'worldId'and x.seed_fingerprint=p_seed_fingerprint;
 select * into strict a from world_v2.runtime_opening_admission x where x.world_id=s.world_id and x.seed_id=s.seed_id and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=p_admission_ref;
 if not exists(select 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref and q.world_id=a.world_id and q.seed_fingerprint=a.seed_fingerprint and q.seed_id=a.seed_id and q.model_version=a.model_version and q.replay_binding=a.replay_binding and a.admitted_at_real>=q.valid_from and a.admitted_at_real<q.valid_until and not exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=q.authorization_id))then raise exception 'BUDGET_ACTUAL_OPENING_ADMISSION_REQUIRED'using errcode='42501';end if;
 select (x->>'canonicalPayload')::jsonb into strict financial from jsonb_array_elements(s.canonical_payload::jsonb->'sources')x where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='adopted-financial-opening-source-v2';
 select x->'roster'into strict roster from jsonb_array_elements(financial->'assembly'->'countries')x where x->>'countryId'=p->>'countryId';
 select (d->>'bytes')::jsonb into strict original from jsonb_array_elements(s.canonical_payload::jsonb->'sources')x cross join lateral jsonb_array_elements((x->>'canonicalPayload')::jsonb->'carrier'->'documents')d where d->>'documentId'='POSTWAR_FINANCIAL_OFFICE_ORIGINALS';
 select x into strict country from jsonb_array_elements(original->'contract'->'countries')x where x->>'countryId'=p->>'countryId';
 if p->>'governmentEntityId'<>roster->>'government'or p->>'currency'<>country->>'localCurrency'or p->>'validFromSimTime'!~'^(0|[1-9][0-9]*)$'or p->>'validUntilSimTime'!~'^(0|[1-9][0-9]*)$'or(p->>'validUntilSimTime')::numeric<=(p->>'validFromSimTime')::numeric then raise exception 'BUDGET_ACTUAL_GOVERNMENT_PERIOD_CURRENCY_REQUIRED'using errcode='23514';end if;
 policy_hash:=encode(sha256(convert_to(p_policy_text,'UTF8')),'hex');
 select * into prior from world_v2.finance_budget_policy_original x where x.world_id=s.world_id and x.country_id=p->>'countryId'and x.envelope_ref=p->>'envelopeRef'and x.period_ref=p->>'effectivePeriodRef';
 if found then if prior.policy_ref<>p_ref or prior.policy_sha256<>policy_hash or prior.admission_ref<>p_admission_ref or prior.issuer_ref<>p_issuer then raise exception 'BUDGET_IMMUTABLE_SOURCE_CONFLICT'using errcode='23514';end if;return prior.policy_ref;end if;
 insert into world_v2.finance_budget_policy_original values(p_ref,s.world_id,p->>'countryId',p->>'envelopeRef',p->>'effectivePeriodRef',s.seed_fingerprint,a.admission_ref,p_issuer,p_policy_text,policy_hash,p_normative_sha256);return p_ref;
end;$$;
alter function world_v2.publish_finance_budget_policy(text,text,text,text,text,text)owner to world_v2_finance_budget_source_owner;
create function world_v2.revoke_finance_budget_policy(p_ref text,p_reason text)returns void language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_finance_budget_source_publisher','MEMBER')then raise exception 'BUDGET_CONTROLLED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform 1 from world_v2.finance_budget_policy_original where policy_ref=p_ref for update;if not found then raise exception 'BUDGET_ORIGINAL_REQUIRED'using errcode='23503';end if;
 insert into world_v2.finance_budget_policy_revocation(policy_ref,reason_ref)values(p_ref,p_reason)on conflict do nothing;
end;$$;
alter function world_v2.revoke_finance_budget_policy(text,text)owner to world_v2_finance_budget_source_owner;
create function world_v2.lock_finance_budget_policy(p_world text,p_country text,p_envelope text,p_period text,p_worker text,p_at timestamptz,p_subject uuid)
returns table(policy_ref text,policy_text text,policy_sha256 text,seed_id text,seed_fingerprint text,admission_ref text,authorization_version text,team_id text,fencing_token text,acquired_at_real text,renewed_at_real text,lease_expires_at_real text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;o world_v2.finance_budget_policy_original%rowtype;l world_v2.world_writer_lease%rowtype;a world_v2.runtime_opening_admission%rowtype;q world_v2.runtime_admission_publication_permit%rowtype;c record;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_finance_budget_source_reader','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_owner','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_publisher','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication))then raise exception 'BUDGET_NATIVE_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.finance_budget_source_world',p_world,true);
 select * into l from world_v2.world_writer_lease x where x.world_id=p_world and x.holder_id=p_worker and x.acquired_at_real<=p_at and x.renewed_at_real<=p_at and x.lease_expires_at_real>p_at and x.lease_expires_at_real>clock_timestamp() for share;
 if not found then raise exception 'BUDGET_CURRENT_WRITER_LEASE_REQUIRED'using errcode='42501';end if;
 select * into o from world_v2.finance_budget_policy_original x where x.world_id=p_world and x.country_id=p_country and x.envelope_ref=p_envelope and x.period_ref=p_period for share;
 if not found then raise exception 'BUDGET_ADOPTED_POLICY_AND_PERIOD_MISSING'using errcode='23503';end if;
 if exists(select 1 from world_v2.finance_budget_policy_revocation x where x.policy_ref=o.policy_ref)then raise exception 'BUDGET_SOURCE_POLICY_REVOKED'using errcode='42501';end if;
 select * into strict a from world_v2.runtime_opening_admission x where x.world_id=p_world and x.seed_fingerprint=o.seed_fingerprint and x.admission_ref=o.admission_ref;
 select * into q from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation x where x.authorization_id=q.authorization_id)then raise exception 'BUDGET_OPENING_ADMISSION_REVOKED_OR_MISSING'using errcode='42501';end if;
 perform 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.active for share;
 perform 1 from world_v2.projection_entitlement x where x.world_id=p_world and x.auth_subject=p_subject and x.active for share;
 select x.team_id,x.authorization_version into strict c from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.country_id=p_country and x.office_id='FINANCE'and x.capability='FINANCE_BUDGET'and x.active;
 if exists(select 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.active and(x.country_id<>p_country or x.team_id<>c.team_id or x.authorization_version<>c.authorization_version))or not exists(select 1 from world_v2.runtime_read_seat s join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex'))and e.active and e.revoked_at is null where s.world_id=p_world and s.auth_subject=p_subject and s.country_id=p_country and s.office_id='FINANCE'and s.team_id=c.team_id and s.authorization_revision=c.authorization_version)then raise exception 'BUDGET_COHERENT_CURRENT_AUTHORITY_REQUIRED'using errcode='42501';end if;
 return query select o.policy_ref,o.policy_text,o.policy_sha256,a.seed_id,o.seed_fingerprint,o.admission_ref,c.authorization_version::text,c.team_id::text,l.fencing_token::text,to_char(l.acquired_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.renewed_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.lease_expires_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end;$$;
alter function world_v2.lock_finance_budget_policy(text,text,text,text,text,timestamptz,uuid)owner to world_v2_finance_budget_source_owner;
revoke all on function world_v2.finance_budget_original_immutable(),world_v2.publish_finance_budget_policy(text,text,text,text,text,text),world_v2.revoke_finance_budget_policy(text,text),world_v2.lock_finance_budget_policy(text,text,text,text,text,timestamptz,uuid)from public;
grant execute on function world_v2.publish_finance_budget_policy(text,text,text,text,text,text),world_v2.revoke_finance_budget_policy(text,text)to world_v2_finance_budget_source_publisher;
grant execute on function world_v2.lock_finance_budget_policy(text,text,text,text,text,timestamptz,uuid)to world_v2_finance_budget_source_reader;
-- Exact Worker authorization-cutoff reads. Economic workers get no UPDATE
-- authority privilege; locks belong to the same existing H-first transaction.
create function world_v2.lock_finance_budget_current_authorization(p_world text,p_subject uuid,p_country text,p_office text,p_capability text)
returns table(auth_subject text,world_id text,country_id text,office_id text,capability text,team_id text,authorization_version text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if p_office<>'FINANCE'or p_capability<>'FINANCE_BUDGET'or not pg_has_role(effective,'world_v2_finance_budget_source_reader','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_owner','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_publisher','MEMBER')then raise exception 'BUDGET_FIXED_AUTHORITY_CUTOFF_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.finance_budget_source_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 return query select a.auth_subject::text,a.world_id,a.country_id,a.office_id,a.capability,a.team_id,a.authorization_version from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject=p_subject and a.country_id=p_country and a.office_id=p_office and a.capability=p_capability and a.active for share;
end;$$;
create function world_v2.lock_finance_budget_revoked_authorization(p_world text,p_subject uuid,p_country text,p_office text)
returns table(present integer)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if p_office<>'FINANCE'or not pg_has_role(effective,'world_v2_finance_budget_source_reader','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_owner','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_publisher','MEMBER')then raise exception 'BUDGET_FIXED_REVOKED_CUTOFF_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.finance_budget_source_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 return query select 1 from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject=p_subject and a.country_id=p_country and a.office_id is not distinct from p_office and a.active for share;
end;$$;
alter function world_v2.lock_finance_budget_current_authorization(text,uuid,text,text,text)owner to world_v2_finance_budget_source_owner;
alter function world_v2.lock_finance_budget_revoked_authorization(text,uuid,text,text)owner to world_v2_finance_budget_source_owner;
revoke all on function world_v2.lock_finance_budget_current_authorization(text,uuid,text,text,text),world_v2.lock_finance_budget_revoked_authorization(text,uuid,text,text)from public;
grant execute on function world_v2.lock_finance_budget_current_authorization(text,uuid,text,text,text),world_v2.lock_finance_budget_revoked_authorization(text,uuid,text,text)to world_v2_finance_budget_source_reader;
create function world_v2.lock_finance_budget_intake_binding(p_world text,p_subject uuid,p_country text,p_office text,p_seat text,p_authorization_version text,p_capability text,p_scope text)
returns table(seat_ref text,team_id text,authorization_version text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if p_office<>'FINANCE'or p_capability<>'FINANCE_BUDGET'or not pg_has_role(effective,'world_v2_finance_budget_source_reader','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_owner','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_publisher','MEMBER')then raise exception 'BUDGET_FIXED_INTAKE_CUTOFF_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.finance_budget_source_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 return query
select seat.seat_ref, authz.team_id, authz.authorization_version,
  admission.admission_ref, admission.seed_id, admission.seed_fingerprint,
  admission.model_version, head.world_version::text, head.event_sequence::text
from world_v2.runtime_read_seat seat
join world_v2.current_commit_authorization authz
  on authz.world_id=seat.world_id and authz.auth_subject=seat.auth_subject
  and authz.country_id=seat.country_id and authz.office_id=seat.office_id
  and authz.team_id=seat.team_id and authz.authorization_version=seat.authorization_revision
  and authz.active and authz.capability=$7
join world_v2.runtime_opening_admission admission on admission.world_id=seat.world_id
join world_v2.opening_seed seed on seed.world_id=admission.world_id
  and seed.seed_id=admission.seed_id and seed.seed_fingerprint=admission.seed_fingerprint
  and seed.replay_binding=admission.replay_binding
  and (seed.replay_binding::jsonb->>'modelVersion')=admission.model_version
join world_v2.world_head head on head.world_id=seed.world_id
join world_v2.projection_entitlement entitlement
  on entitlement.world_id=seat.world_id and entitlement.auth_subject=seat.auth_subject
  and entitlement.authorization_version=seat.authorization_revision and entitlement.active
  and entitlement.revoked_at is null and entitlement.classification='OFFICE_PRIVATE'
  and entitlement.scope_key=$8
where seat.world_id=$1 and seat.auth_subject=$2::uuid and seat.country_id=$3
  and seat.office_id=$4 and seat.seat_ref=$5 and seat.authorization_revision=$6
  and not exists (select 1 from world_v2.current_commit_authorization other
    where other.world_id=seat.world_id and other.auth_subject=seat.auth_subject and other.active
      and (other.country_id is distinct from seat.country_id or other.team_id is distinct from seat.team_id
        or other.authorization_version is distinct from seat.authorization_revision))
limit 2 for share of authz,entitlement;
end;$$;
alter function world_v2.lock_finance_budget_intake_binding(text,uuid,text,text,text,text,text,text)owner to world_v2_finance_budget_source_owner;
revoke all on function world_v2.lock_finance_budget_intake_binding(text,uuid,text,text,text,text,text,text)from public;
grant execute on function world_v2.lock_finance_budget_intake_binding(text,uuid,text,text,text,text,text,text)to world_v2_finance_budget_source_reader;
revoke create on schema world_v2 from world_v2_finance_budget_source_owner;
commit;
