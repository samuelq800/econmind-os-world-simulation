-- Forward read optimization, after postwar-office-derived-read.sql. The same
-- transaction reads admission once before joining capability rows. Existing
-- owner, ACL, role, seat, scope, head and revocation checks remain unchanged.
begin;
create or replace function world_v2.read_postwar_office_projection_seats(p_world text)
returns table(world_id text,country_id text,office_id text,auth_subject text,team_id text,authorization_revision text,scope_key text,seat_ref text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,source_bundle_sha256 text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare offices integer;bindings integer;
begin
 if not world_v2.postwar_projection_reader_allowed() then raise exception 'POSTWAR_BOUNDED_READER_ROLE_DENIED' using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select count(distinct a.office_id),count(distinct(a.country_id,a.team_id,a.authorization_version))into offices,bindings from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject::text=current_setting('request.jwt.claim.sub',true)and a.active;
 if offices>6 or bindings>1 then raise exception 'POSTWAR_CURRENT_SEAT_NOT_COHERENT'using errcode='42501';end if;
 if exists(select 1 from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject::text=current_setting('request.jwt.claim.sub',true)and a.active and(
  a.office_id not in('CAPTAIN','FINANCE','CENTRAL_BANK','INDUSTRY','TRADE','SOCIAL')or a.capability<>all(case a.office_id when 'SOCIAL' then array['SOCIAL_LABOUR','SOCIAL_EDUCATION','SOCIAL_DEVELOPMENT'] when 'FINANCE' then array['FINANCE_TREASURY','FINANCE_BUDGET','FINANCE_PUBLIC_DEBT'] when 'CENTRAL_BANK' then array['CENTRAL_BANK_MONETARY_POLICY','CENTRAL_BANK_BANKING_STABILITY','CENTRAL_BANK_FX_RESERVES'] when 'INDUSTRY' then array['INDUSTRY_PRODUCTION','INDUSTRY_TECHNOLOGY','INDUSTRY_RESOURCES'] when 'TRADE' then array['TRADE_POLICY','TRADE_CONTRACTS','TRADE_FOREIGN_AFFAIRS'] when 'CAPTAIN' then array['CAPTAIN_STRATEGY','CAPTAIN_CABINET','CAPTAIN_CRISIS_COORDINATION'] else array[]::text[] end)or not exists(select 1 from world_v2.runtime_read_seat s join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex'))and e.active and e.revoked_at is null
  where s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version)
 ))then raise exception 'POSTWAR_CURRENT_SEAT_NOT_COHERENT'using errcode='42501';end if;
 return query with admission as materialized (select * from world_v2.postwar_projection_admission_header(p_world)) select distinct s.world_id,s.country_id,s.office_id,s.auth_subject::text,s.team_id,s.authorization_revision,e.scope_key,s.seat_ref,h.admission_ref,h.seed_id,h.seed_fingerprint,h.model_version,h.replay_binding,h.source_bundle_sha256,w.world_version::text,w.event_sequence::text
 from world_v2.runtime_read_seat s join world_v2.current_commit_authorization a on a.world_id=s.world_id and a.auth_subject=s.auth_subject and a.country_id=s.country_id and a.office_id=s.office_id and a.team_id=s.team_id and a.authorization_version=s.authorization_revision and a.active
 join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE' and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex')) and e.active and e.revoked_at is null
 join world_v2.world_head w on w.world_id=s.world_id
 cross join admission h
 where s.world_id=p_world and s.auth_subject::text=current_setting('request.jwt.claim.sub',true)
 and a.capability=any(case s.office_id when 'SOCIAL' then array['SOCIAL_LABOUR','SOCIAL_EDUCATION','SOCIAL_DEVELOPMENT'] when 'FINANCE' then array['FINANCE_TREASURY','FINANCE_BUDGET','FINANCE_PUBLIC_DEBT'] when 'CENTRAL_BANK' then array['CENTRAL_BANK_MONETARY_POLICY','CENTRAL_BANK_BANKING_STABILITY','CENTRAL_BANK_FX_RESERVES'] when 'INDUSTRY' then array['INDUSTRY_PRODUCTION','INDUSTRY_TECHNOLOGY','INDUSTRY_RESOURCES'] when 'TRADE' then array['TRADE_POLICY','TRADE_CONTRACTS','TRADE_FOREIGN_AFFAIRS'] when 'CAPTAIN' then array['CAPTAIN_STRATEGY','CAPTAIN_CABINET','CAPTAIN_CRISIS_COORDINATION'] else array[]::text[] end)
 and not exists(select 1 from world_v2.current_commit_authorization other where other.world_id=s.world_id and other.auth_subject=s.auth_subject and other.active and(other.country_id<>s.country_id or other.team_id<>s.team_id or other.authorization_version<>s.authorization_revision))
 order by s.office_id limit 7;
end;$$;
alter function world_v2.read_postwar_office_projection_seats(text)owner to world_v2_postwar_projection_owner;
commit;
