-- SOURCE-ONLY native consumer proposal, absent from the migration manifest.
-- No source issuer/publication entrypoint, role memberships or original values
-- are created. A separately reviewed issuer must load independently adopted
-- genesis/reason originals bound to the target seed. Opening-seed admission is
-- NOT admission of external Captain originals. Never backfill from UI summaries.
begin;
do $$declare n text;begin foreach n in array array['world_v2_captain_source_owner','world_v2_captain_source_reader']loop
 if not exists(select 1 from pg_roles where rolname=n)then execute format('create role %I nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',n);end if;
 if exists(select 1 from pg_roles where rolname=n and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'CAPTAIN_UNSAFE_FIXED_ROLE'using errcode='42501';end if;
end loop;end;$$;
grant usage,create on schema world_v2 to world_v2_captain_source_owner;
grant usage on schema world_v2 to world_v2_captain_source_reader;
-- This is a source-custody catalog, not mutable political-capital World State.
-- No operational role receives INSERT or an automatic admission constructor.
create table world_v2.captain_operating_source_adoption(
 adoption_ref text primary key,world_id text not null,country_id text not null,
 seed_fingerprint text not null,issuer_ref text not null,custodian_ref text not null,
 admission_ref text not null,admission_revision text not null,
 original_admission_evidence_sha256 text not null check(original_admission_evidence_sha256~'^[a-f0-9]{64}$'),
 unique(world_id,country_id),
 foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint)
);
create table world_v2.captain_operating_original(
 adoption_ref text not null references world_v2.captain_operating_source_adoption(adoption_ref),
 record_kind text not null check(record_kind in('GENESIS','REASON')),fact_ref text not null,
 original_text text not null check(octet_length(original_text)<=2097152),
 original_sha256 text not null check(original_sha256=encode(sha256(convert_to(original_text,'UTF8')),'hex')),
 primary key(adoption_ref,record_kind,fact_ref)
);
create unique index captain_exact_one_genesis on world_v2.captain_operating_original(adoption_ref)where record_kind='GENESIS';
create table world_v2.captain_operating_source_revocation(
 adoption_ref text primary key references world_v2.captain_operating_source_adoption(adoption_ref),
 reason_ref text not null check(length(reason_ref)between 1 and 256),revoked_at timestamptz not null default clock_timestamp()
);
alter table world_v2.captain_operating_source_adoption owner to world_v2_captain_source_owner;
alter table world_v2.captain_operating_original owner to world_v2_captain_source_owner;
alter table world_v2.captain_operating_source_revocation owner to world_v2_captain_source_owner;
revoke all on world_v2.captain_operating_source_adoption,world_v2.captain_operating_original,world_v2.captain_operating_source_revocation from public;
grant select on world_v2.world_writer_lease to world_v2_captain_source_owner;
grant update(fencing_token)on world_v2.world_writer_lease to world_v2_captain_source_owner;
grant select(world_id,auth_subject,country_id,office_id,team_id,authorization_version,capability,active)on world_v2.current_commit_authorization to world_v2_captain_source_owner;
-- Every source revoker/issuer must acquire adoption FOR UPDATE before inserting
-- a revocation/new reason. The immutable triggers also fence the owning role.
do $$declare n text;begin foreach n in array array['captain_operating_source_adoption','captain_operating_original','captain_operating_source_revocation']loop
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',n||'_immutable',n);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',n||'_no_truncate',n);
end loop;end;$$;
-- Row trigger enforces the cooperation protocol even for an owning INSERT.
create function world_v2.lock_captain_original_parent()returns trigger language plpgsql security invoker as $$begin
 perform 1 from world_v2.captain_operating_source_adoption a where a.adoption_ref=new.adoption_ref for update;
 if not found then raise exception 'CAPTAIN_ADOPTED_PARENT_REQUIRED'using errcode='23514';end if;
 return new;end;$$;
alter function world_v2.lock_captain_original_parent()owner to world_v2_captain_source_owner;
create trigger captain_original_parent_lock before insert on world_v2.captain_operating_original for each row execute function world_v2.lock_captain_original_parent();
create trigger captain_revocation_parent_lock before insert on world_v2.captain_operating_source_revocation for each row execute function world_v2.lock_captain_original_parent();
create function world_v2.lock_captain_operating_originals(p_world text,p_country text,p_reason text,p_worker text,p_at timestamptz,p_subject uuid)
returns table(status text,missing text[],world_id text,country_id text,issuer_ref text,custodian_ref text,admission_ref text,admission_revision text,genesis_text text,reason_text text,fencing_token text,acquired_at_real text,renewed_at_real text,lease_expires_at_real text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a world_v2.captain_operating_source_adoption%rowtype;g world_v2.captain_operating_original%rowtype;r world_v2.captain_operating_original%rowtype;l world_v2.world_writer_lease%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_captain_source_reader'or pg_has_role(effective,'world_v2_captain_source_owner','MEMBER')then raise exception 'CAPTAIN_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if not exists(select 1 from world_v2.current_commit_authorization c where c.world_id=p_world and c.auth_subject=p_subject and c.country_id=p_country and c.office_id='CAPTAIN'and c.capability='CAPTAIN_CABINET'and c.active)
 or exists(select 1 from world_v2.current_commit_authorization c join world_v2.current_commit_authorization d on d.world_id=c.world_id and d.auth_subject=c.auth_subject and d.active where c.world_id=p_world and c.auth_subject=p_subject and c.active and(c.country_id<>d.country_id or c.team_id<>d.team_id or c.authorization_version<>d.authorization_version))then raise exception 'CAPTAIN_CURRENT_MEMBERSHIP_REQUIRED'using errcode='42501';end if;
 -- Existing submission lock is owned by the consumer. Lease precedes originals
 -- and the later runtime-reader head/history lock; no source takes H first.
 select * into l from world_v2.world_writer_lease w where w.world_id=p_world and w.holder_id=p_worker and w.acquired_at_real<=p_at and w.renewed_at_real<=p_at and w.lease_expires_at_real>p_at for share;
 status:='MISSING';missing:=array[]::text[];
 if not found then missing:=array['WRITER_LEASE'];return next;return;end if;
 select * into a from world_v2.captain_operating_source_adoption x where x.world_id=p_world and x.country_id=p_country for share;
 if not found or exists(select 1 from world_v2.captain_operating_source_revocation x where x.adoption_ref=a.adoption_ref)then missing:=array['POLITICAL_CAPITAL_EVENT_LINEAGE','REASON_RECORD'];return next;return;end if;
 select * into g from world_v2.captain_operating_original x where x.adoption_ref=a.adoption_ref and x.record_kind='GENESIS'for share;
 if not found then missing:=array_append(missing,'POLITICAL_CAPITAL_EVENT_LINEAGE');end if;
 select * into r from world_v2.captain_operating_original x where x.adoption_ref=a.adoption_ref and x.record_kind='REASON'and x.fact_ref=p_reason for share;
 if not found then missing:=array_append(missing,'REASON_RECORD');end if;
 if cardinality(missing)>0 then return next;return;end if;
 if g.original_sha256<>encode(sha256(convert_to(g.original_text,'UTF8')),'hex')or r.original_sha256<>encode(sha256(convert_to(r.original_text,'UTF8')),'hex')then raise exception 'CAPTAIN_ORIGINAL_HASH_MISMATCH'using errcode='23514';end if;
 status:='ORIGINALS';world_id:=a.world_id;country_id:=a.country_id;issuer_ref:=a.issuer_ref;custodian_ref:=a.custodian_ref;admission_ref:=a.admission_ref;admission_revision:=a.admission_revision;genesis_text:=g.original_text;reason_text:=r.original_text;fencing_token:=l.fencing_token::text;
 acquired_at_real:=to_char(l.acquired_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');renewed_at_real:=to_char(l.renewed_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');lease_expires_at_real:=to_char(l.lease_expires_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');return next;
end;$$;
alter function world_v2.lock_captain_operating_originals(text,text,text,text,timestamptz,uuid)owner to world_v2_captain_source_owner;
revoke all on function world_v2.lock_captain_original_parent(),world_v2.lock_captain_operating_originals(text,text,text,text,timestamptz,uuid)from public;
grant execute on function world_v2.lock_captain_operating_originals(text,text,text,text,timestamptz,uuid)to world_v2_captain_source_reader;
revoke create on schema world_v2 from world_v2_captain_source_owner;
commit;
