-- Source-only, not registered in the production migration manifest. Depends on
-- postwar-office-derived-read.sql's reviewed immutable admission/custody owner.
-- No money, original, mandate, route, LOGIN or membership is created.
begin;
do $$begin
 if not exists(select 1 from pg_roles where rolname='world_v2_postwar_narrow_trade_source')then create role world_v2_postwar_narrow_trade_source nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;end if;
 if exists(select 1 from pg_roles where rolname='world_v2_postwar_narrow_trade_source'and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'UNSAFE_POSTWAR_NARROW_SOURCE_ROLE'using errcode='42501';end if;
end;$$;
grant usage on schema world_v2 to world_v2_postwar_narrow_trade_source;
grant create on schema world_v2 to world_v2_postwar_projection_owner;
grant update(authorization_version)on world_v2.current_commit_authorization to world_v2_postwar_projection_owner;
-- Lock visibility only; the inaccessible definer gets no policy permitting an
-- authorization UPDATE. Existing intake owns the same row before this call.
create policy postwar_narrow_source_authorization_lock on world_v2.current_commit_authorization for update to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true))with check(false);
-- Independent domain admission is required in addition to World admission.
-- No public/reader/publisher INSERT or admission constructor is supplied: the
-- real rights issuer/adoption protocol remains an explicit deployment input.
create table world_v2.postwar_narrow_trade_rights_admission(
 world_id text not null,seed_fingerprint text not null,source_id text not null,source_payload_hash text not null,
 issuer_ref text not null,custodian_ref text not null,admission_ref text not null unique,admission_revision text not null,
 admission_evidence_sha256 text not null check(admission_evidence_sha256~'^[a-f0-9]{64}$'),
 primary key(world_id,source_id),foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint)
);
create table world_v2.postwar_narrow_trade_rights_revocation(
 admission_ref text primary key references world_v2.postwar_narrow_trade_rights_admission(admission_ref),reason_ref text not null
);
alter table world_v2.postwar_narrow_trade_rights_admission owner to world_v2_postwar_projection_owner;
alter table world_v2.postwar_narrow_trade_rights_revocation owner to world_v2_postwar_projection_owner;
revoke all on world_v2.postwar_narrow_trade_rights_admission,world_v2.postwar_narrow_trade_rights_revocation from public;
do $$declare t text;begin foreach t in array array['postwar_narrow_trade_rights_admission','postwar_narrow_trade_rights_revocation']loop
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t||'_immutable',t);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t||'_no_truncate',t);
end loop;end;$$;
create function world_v2.lock_postwar_narrow_rights_revocation_parent()returns trigger language plpgsql security invoker as $$begin
 perform 1 from world_v2.postwar_narrow_trade_rights_admission a where a.admission_ref=new.admission_ref for update;
 if not found then raise exception 'POSTWAR_NARROW_RIGHTS_ADMISSION_REQUIRED'using errcode='23514';end if;return new;
end;$$;
alter function world_v2.lock_postwar_narrow_rights_revocation_parent()owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.lock_postwar_narrow_rights_revocation_parent()from public;
create trigger postwar_narrow_rights_revocation_parent before insert on world_v2.postwar_narrow_trade_rights_revocation for each row execute function world_v2.lock_postwar_narrow_rights_revocation_parent();
-- New domain-admission rows take H before publication. Together with the
-- reader's H lock this fences new-row phantoms in ordinary READ COMMITTED.
create function world_v2.lock_postwar_narrow_rights_admission_parent()returns trigger language plpgsql security invoker as $$begin
 perform 1 from world_v2.world_head w where w.world_id=new.world_id for update;
 if not found then raise exception 'POSTWAR_NARROW_WORLD_REQUIRED'using errcode='23514';end if;return new;
end;$$;
alter function world_v2.lock_postwar_narrow_rights_admission_parent()owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.lock_postwar_narrow_rights_admission_parent()from public;
create trigger postwar_narrow_rights_admission_parent before insert on world_v2.postwar_narrow_trade_rights_admission for each row execute function world_v2.lock_postwar_narrow_rights_admission_parent();
create function world_v2.read_postwar_narrow_trade_source(p_world text,p_seller text,p_buyer text,p_batch text,p_subject uuid,p_team text,p_revision text)
returns table(status text,seed_fingerprint text,admission_ref text,world_version text,event_sequence text,stock jsonb,buyer_cash jsonb,seller_cash jsonb,rights jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;seed world_v2.opening_seed%rowtype;root jsonb;financial jsonb;buyer_roster jsonb;current_owner text;source_rows jsonb;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'FIXED_POSTWAR_NARROW_SOURCE_READER_REQUIRED'using errcode='42501';end if;
 if p_seller=p_buyer or p_subject::text is distinct from current_setting('request.jwt.claim.sub',true)then raise exception 'POSTWAR_NARROW_EXACT_SCOPE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 if not exists(select 1 from world_v2.current_commit_authorization a join world_v2.runtime_read_seat s on s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version
  join world_v2.projection_entitlement e on e.world_id=a.world_id and e.auth_subject=a.auth_subject and e.authorization_version=a.authorization_version and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(a.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(a.office_id,'UTF8'),'hex'))and e.active and e.revoked_at is null
  where a.world_id=p_world and a.country_id=p_seller and a.auth_subject=p_subject and a.team_id=p_team and a.authorization_version=p_revision and a.office_id='TRADE'and a.capability='TRADE_CONTRACTS'and a.active)
 or exists(select 1 from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject=p_subject and a.active and(a.country_id<>p_seller or a.team_id<>p_team or a.authorization_version<>p_revision))then raise exception 'POSTWAR_NARROW_CURRENT_SELLER_REQUIRED'using errcode='42501';end if;
 select * into h from world_v2.postwar_projection_admission_header(p_world);
 select w.world_version::text,w.event_sequence::text into world_version,event_sequence from world_v2.world_head w where w.world_id=p_world for update;
 perform 1 from world_v2.current_commit_authorization a where a.world_id=p_world and a.country_id=p_seller and a.auth_subject=p_subject and a.team_id=p_team and a.authorization_version=p_revision and a.office_id='TRADE'and a.capability='TRADE_CONTRACTS'and a.active for share;
 if not found then raise exception 'POSTWAR_NARROW_CURRENT_SELLER_REQUIRED'using errcode='42501';end if;
 status:='UNAVAILABLE';stock:='[]'::jsonb;buyer_cash:='[]'::jsonb;seller_cash:='[]'::jsonb;rights:='[]'::jsonb;
 if h.admission_ref is null then return next;return;end if;
 -- Revocation acquires the conflicting permit lock. This same owning executor
 -- retains the native SHARE lock through intake's outer COMMIT/ROLLBACK.
 perform 1 from world_v2.runtime_admission_publication_permit p where 'ADMISSION_'||upper(p.authorization_sha256)=h.admission_ref for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit p using(authorization_id)where 'ADMISSION_'||upper(p.authorization_sha256)=h.admission_ref)then return next;return;end if;
 select * into seed from world_v2.opening_seed s where s.world_id=p_world and s.seed_fingerprint=h.seed_fingerprint;
 if not found then return next;return;end if;
 seed_fingerprint:=seed.seed_fingerprint;admission_ref:=h.admission_ref;status:='SOURCE';
 if world_version<>'0'or event_sequence<>'0'then return next;return;end if;
 root:=seed.canonical_payload::jsonb;
 select x into financial from jsonb_array_elements(root->'sources')x where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='adopted-financial-opening-source-v2';
 if financial is null then status:='UNAVAILABLE';return next;return;end if;
 select x->'roster' into buyer_roster from jsonb_array_elements((financial->>'canonicalPayload')::jsonb->'assembly'->'countries')x where x->>'countryId'=p_buyer;
 if buyer_roster is null then status:='UNAVAILABLE';return next;return;end if;
 select coalesce(jsonb_agg(jsonb_build_object('entryId',x->>'entryId','sourceId',x->>'sourceId','sourcePayloadHash',financial->>'payloadHash','batchId',x->'account'->>'batchId','unit',x->'account'->>'unit','quantity',x->'quantity'->>'amount','titleHolderId',x->'account'->>'titleHolderId','riskBearerId',x->'account'->>'riskBearerId','physicalLocationId',x->'account'->>'physicalLocationId','economicRecognitionId',x->'account'->'economicRecognitionId')order by x->>'entryId'),'[]'::jsonb)into stock from jsonb_array_elements(root->'inventoryEntries')x where x->>'sourceId'=financial->>'sourceId'and x->'account'->>'countryId'=p_seller and x->'account'->>'commodityId'='GRAIN'and x->'account'->>'batchId'=p_batch and x->'account'->>'bucket'='AVAILABLE'and x->'account'->'reservationId'='null'::jsonb and x->'account'->'shipmentId'='null'::jsonb;
 current_owner:=stock->0->>'titleHolderId';
 with legs as(select l from jsonb_array_elements(root->'financialBatches')b cross join lateral jsonb_array_elements(b->'legs')l),
  accounts as(select distinct on(l->'account'->>'accountId')l->'account'as a from legs order by l->'account'->>'accountId'),
  balances as(select a,(select sum(case when l->>'direction'='DEBIT'then(l->'amount'->>'amount')::numeric else-(l->'amount'->>'amount')::numeric end)::text from legs where l->'account'->>'accountId'=a->>'accountId')as amount from accounts where a->>'accountClass'='CASH'and a->>'currency'='GCU'and a->'claimId'='null'::jsonb and a->'counterpartyEntityId'='null'::jsonb)
 select coalesce(jsonb_agg(jsonb_build_object('accountId',a->>'accountId','amount',amount))filter(where a->>'countryId'=p_buyer and a->>'ownerId'=buyer_roster->>'government'),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object('accountId',a->>'accountId','amount',amount))filter(where a->>'countryId'=p_seller and a->>'ownerId'=current_owner),'[]'::jsonb)into buyer_cash,seller_cash from balances;
 -- A schema/source tag or World admission alone cannot admit rights. Real
 -- independent original/adoption rows and cooperating revocation locks are
 -- mandatory. None are synthesized from a route, role or source hash.
 perform 1 from world_v2.postwar_narrow_trade_rights_admission a where a.world_id=p_world and a.seed_fingerprint=seed.seed_fingerprint for share;
 select coalesce(jsonb_agg(v||jsonb_build_object('sourceId',s->>'sourceId','sourcePayloadHash',s->>'payloadHash','domainAdmissionRef',a.admission_ref,'domainAdmissionRevision',a.admission_revision)),'[]'::jsonb)into rights
 from jsonb_array_elements(root->'sources')s join world_v2.postwar_narrow_trade_rights_admission a on a.world_id=p_world and a.seed_fingerprint=seed.seed_fingerprint and a.source_id=s->>'sourceId'and a.source_payload_hash=s->>'payloadHash'
 cross join lateral jsonb_array_elements(case when(s->>'canonicalPayload')::jsonb->>'schemaVersion'='postwar-narrow-trade-operating-rights-v1'and(s->>'canonicalPayload')::jsonb->>'worldId'=p_world then(s->>'canonicalPayload')::jsonb->'records'else'[]'::jsonb end)v
 where(v->>'countryId'=p_seller or v->>'fromCountryId'=p_seller)and not exists(select 1 from world_v2.postwar_narrow_trade_rights_revocation r where r.admission_ref=a.admission_ref);
 if octet_length(stock::text)+octet_length(buyer_cash::text)+octet_length(seller_cash::text)+octet_length(rights::text)>40000 then raise exception 'POSTWAR_NARROW_SOURCE_TOO_LARGE'using errcode='54000';end if;
 return next;
end;$$;
alter function world_v2.read_postwar_narrow_trade_source(text,text,text,text,uuid,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_narrow_trade_source(text,text,text,text,uuid,text,text)from public;
grant execute on function world_v2.read_postwar_narrow_trade_source(text,text,text,text,uuid,text,text)to world_v2_postwar_narrow_trade_source;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
