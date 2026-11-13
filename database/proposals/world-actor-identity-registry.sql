-- CANDIDATE ONLY. No production installation, memberships or identity records.
-- Depends on world_v2.world_head. Registry facts are identities, not Office,
-- ownership, command capability, source admission or economic authorizations.
-- Release operators must supply an existing World actor and explicit original
-- issuer/reference/hash; no UUID-to-actor derivation or V1 identity import.
begin;
do $$declare n text;r record;begin
 foreach n in array array['world_v2_actor_registry_owner','world_v2_actor_registry_reader','world_v2_actor_registry_publisher']loop
  if not exists(select 1 from pg_roles where rolname=n)then execute format('create role %I nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',n);end if;
  select * into strict r from pg_roles where rolname=n;
  if r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication then raise exception 'ACTOR_REGISTRY_ROLE_PROFILE_INVALID'using errcode='42501';end if;
 end loop;
end$$;
grant usage,create on schema world_v2 to world_v2_actor_registry_owner;
grant usage on schema world_v2 to world_v2_actor_registry_reader,world_v2_actor_registry_publisher;

create table world_v2.world_actor_binding(
 world_id text not null references world_v2.world_head(world_id),
 binding_ref text not null check(binding_ref~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'and length(binding_ref)<=128),
 auth_subject uuid not null,
 actor_id text not null check(actor_id~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'and length(actor_id)<=128),
 issuer_ref text not null check(issuer_ref~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'and length(issuer_ref)<=128),
 original_sha256 text not null check(original_sha256~'^[0-9a-f]{64}$'),
 published_by name not null,registered_at_real timestamptz not null default clock_timestamp(),
 primary key(world_id,binding_ref)
);
create table world_v2.world_actor_binding_revocation(
 world_id text not null,binding_ref text not null,revocation_ref text not null,
 issuer_ref text not null,original_sha256 text not null,published_by name not null,
 revoked_at_real timestamptz not null default clock_timestamp(),
 primary key(world_id,binding_ref),unique(world_id,revocation_ref),
 foreign key(world_id,binding_ref)references world_v2.world_actor_binding(world_id,binding_ref)
);
create table world_v2.world_actor_reader_scope(
 world_id text not null references world_v2.world_head(world_id),scope_ref text not null,
 reader_role name not null,issuer_ref text not null,original_sha256 text not null,
 published_by name not null,registered_at_real timestamptz not null default clock_timestamp(),
 primary key(world_id,scope_ref)
);
create table world_v2.world_actor_reader_scope_revocation(
 world_id text not null,scope_ref text not null,revocation_ref text not null,
 issuer_ref text not null,original_sha256 text not null,published_by name not null,
 revoked_at_real timestamptz not null default clock_timestamp(),
 primary key(world_id,scope_ref),unique(world_id,revocation_ref),
 foreign key(world_id,scope_ref)references world_v2.world_actor_reader_scope(world_id,scope_ref)
);
alter table world_v2.world_actor_binding owner to world_v2_actor_registry_owner;
alter table world_v2.world_actor_binding_revocation owner to world_v2_actor_registry_owner;
alter table world_v2.world_actor_reader_scope owner to world_v2_actor_registry_owner;
alter table world_v2.world_actor_reader_scope_revocation owner to world_v2_actor_registry_owner;
-- No reader or publisher table SELECT/DML. The fixed predicates below are the
-- isolation boundary even if another schema's tables do not use RLS.
revoke all on world_v2.world_actor_binding,world_v2.world_actor_binding_revocation,world_v2.world_actor_reader_scope,world_v2.world_actor_reader_scope_revocation from public,world_v2_actor_registry_reader,world_v2_actor_registry_publisher;

create function world_v2.world_actor_registry_invoker(p_mode text)returns name
language plpgsql security definer set search_path=pg_catalog,world_v2 as $$
declare who name; r record;begin
 who:=coalesce(nullif(current_setting('role',true),'none'),session_user);
 select * into strict r from pg_roles where rolname=who;
 if r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication
  or pg_has_role(who,'world_v2_actor_registry_owner','MEMBER')then raise exception 'ACTOR_REGISTRY_CALLER_ROLE_DENIED'using errcode='42501';end if;
 if p_mode='READ'then
  if not pg_has_role(who,'world_v2_actor_registry_reader','MEMBER')or pg_has_role(who,'world_v2_actor_registry_publisher','MEMBER')then raise exception 'ACTOR_REGISTRY_READER_REQUIRED'using errcode='42501';end if;
 elsif p_mode='PUBLISH'then
  if not pg_has_role(who,'world_v2_actor_registry_publisher','MEMBER')or pg_has_role(who,'world_v2_actor_registry_reader','MEMBER')then raise exception 'ACTOR_REGISTRY_PUBLISHER_REQUIRED'using errcode='42501';end if;
  -- SSI is mandatory as well as the World-local configuration lock: a
  -- pre-existing RR snapshot must not admit two concurrent active mappings.
  if current_setting('transaction_read_only')<>'off'or current_setting('transaction_isolation')<>'serializable'then raise exception 'ACTOR_REGISTRY_SERIALIZABLE_PUBLICATION_REQUIRED'using errcode='25001';end if;
 else raise exception 'ACTOR_REGISTRY_MODE_DENIED'using errcode='42501';end if;
 return who;
end$$;
create function world_v2.world_actor_registry_immutable()returns trigger language plpgsql set search_path=pg_catalog as $$begin raise exception 'ACTOR_REGISTRY_APPEND_ONLY'using errcode='55000';end$$;
create trigger world_actor_binding_immutable before update or delete or truncate on world_v2.world_actor_binding for each statement execute function world_v2.world_actor_registry_immutable();
create trigger world_actor_binding_revocation_immutable before update or delete or truncate on world_v2.world_actor_binding_revocation for each statement execute function world_v2.world_actor_registry_immutable();
create trigger world_actor_reader_scope_immutable before update or delete or truncate on world_v2.world_actor_reader_scope for each statement execute function world_v2.world_actor_registry_immutable();
create trigger world_actor_reader_scope_revocation_immutable before update or delete or truncate on world_v2.world_actor_reader_scope_revocation for each statement execute function world_v2.world_actor_registry_immutable();

create function world_v2.publish_world_actor_binding(p_world text,p_subject uuid,p_actor text,p_binding text,p_issuer text,p_original_sha256 text)returns text
language plpgsql security definer set search_path=pg_catalog,world_v2 as $$
declare who name;r record;begin
 who:=world_v2.world_actor_registry_invoker('PUBLISH');
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or length(p_world)>128 or p_subject is null then raise exception 'ACTOR_REGISTRY_SCOPE_INVALID'using errcode='22023';end if;
 -- A World-local configuration lock serializes binding/revocation races. It
 -- does not acquire an economic World/head lock or write a World event.
 perform pg_advisory_xact_lock(hashtextextended('WORLD_ACTOR_REGISTRY:'||p_world,0));
 select * into r from world_v2.world_actor_binding where world_id=p_world and binding_ref=p_binding;
 if found then
  if r.auth_subject is distinct from p_subject or r.actor_id is distinct from p_actor or r.issuer_ref is distinct from p_issuer or r.original_sha256 is distinct from p_original_sha256 then raise exception 'ACTOR_REGISTRY_REFERENCE_CONFLICT'using errcode='23505';end if;
  return p_binding; -- A retry never removes an existing revocation.
 end if;
 if exists(select 1 from world_v2.world_actor_binding b where b.world_id=p_world and(b.auth_subject=p_subject or b.actor_id=p_actor)and not exists(select 1 from world_v2.world_actor_binding_revocation v where v.world_id=b.world_id and v.binding_ref=b.binding_ref))then raise exception 'ACTOR_REGISTRY_ACTIVE_IDENTITY_CONFLICT'using errcode='23505';end if;
 insert into world_v2.world_actor_binding(world_id,auth_subject,actor_id,binding_ref,issuer_ref,original_sha256,published_by)values(p_world,p_subject,p_actor,p_binding,p_issuer,p_original_sha256,who);
 return p_binding;
end$$;
create function world_v2.revoke_world_actor_binding(p_world text,p_binding text,p_revocation text,p_issuer text,p_original_sha256 text)returns text
language plpgsql security definer set search_path=pg_catalog,world_v2 as $$
declare who name;r record;begin
 who:=world_v2.world_actor_registry_invoker('PUBLISH');
 if p_revocation is null or p_revocation!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or length(p_revocation)>128 or p_issuer is null or p_issuer!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or length(p_issuer)>128 or p_original_sha256 is null or p_original_sha256!~'^[0-9a-f]{64}$'then raise exception 'ACTOR_REGISTRY_REVOCATION_INVALID'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('WORLD_ACTOR_REGISTRY:'||p_world,0));
 select * into r from world_v2.world_actor_binding_revocation where world_id=p_world and binding_ref=p_binding;
 if found then
  if r.revocation_ref is distinct from p_revocation or r.issuer_ref is distinct from p_issuer or r.original_sha256 is distinct from p_original_sha256 then raise exception 'ACTOR_REGISTRY_REVOCATION_CONFLICT'using errcode='23505';end if;
  return p_revocation;
 end if;
 insert into world_v2.world_actor_binding_revocation(world_id,binding_ref,revocation_ref,issuer_ref,original_sha256,published_by)values(p_world,p_binding,p_revocation,p_issuer,p_original_sha256,who);
 return p_revocation;
end$$;
create function world_v2.publish_world_actor_reader_scope(p_world text,p_scope text,p_reader name,p_issuer text,p_original_sha256 text)returns text
language plpgsql security definer set search_path=pg_catalog,world_v2 as $$
declare who name;r record;begin
 who:=world_v2.world_actor_registry_invoker('PUBLISH');
 if p_scope is null or p_scope!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or length(p_scope)>128 or p_issuer is null or p_issuer!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or length(p_issuer)>128 or p_original_sha256 is null or p_original_sha256!~'^[0-9a-f]{64}$'then raise exception 'ACTOR_REGISTRY_SCOPE_ORIGINAL_INVALID'using errcode='22023';end if;
 select * into r from pg_roles where rolname=p_reader;
 if not found or p_reader='world_v2_actor_registry_reader'or r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication or not pg_has_role(p_reader,'world_v2_actor_registry_reader','MEMBER')or pg_has_role(p_reader,'world_v2_actor_registry_owner','MEMBER')or pg_has_role(p_reader,'world_v2_actor_registry_publisher','MEMBER')then raise exception 'ACTOR_REGISTRY_SCOPED_READER_REQUIRED'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('WORLD_ACTOR_REGISTRY:'||p_world,0));
 select * into r from world_v2.world_actor_reader_scope where world_id=p_world and scope_ref=p_scope;
 if found then
  if r.reader_role is distinct from p_reader or r.issuer_ref is distinct from p_issuer or r.original_sha256 is distinct from p_original_sha256 then raise exception 'ACTOR_REGISTRY_SCOPE_REFERENCE_CONFLICT'using errcode='23505';end if;
  return p_scope;
 end if;
 if exists(select 1 from world_v2.world_actor_reader_scope s where s.world_id=p_world and s.reader_role=p_reader and not exists(select 1 from world_v2.world_actor_reader_scope_revocation v where v.world_id=s.world_id and v.scope_ref=s.scope_ref))then raise exception 'ACTOR_REGISTRY_ACTIVE_READER_SCOPE_CONFLICT'using errcode='23505';end if;
 insert into world_v2.world_actor_reader_scope(world_id,scope_ref,reader_role,issuer_ref,original_sha256,published_by)values(p_world,p_scope,p_reader,p_issuer,p_original_sha256,who);
 return p_scope;
end$$;
create function world_v2.revoke_world_actor_reader_scope(p_world text,p_scope text,p_revocation text,p_issuer text,p_original_sha256 text)returns text
language plpgsql security definer set search_path=pg_catalog,world_v2 as $$
declare who name;r record;begin
 who:=world_v2.world_actor_registry_invoker('PUBLISH');
 if p_revocation is null or p_revocation!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or length(p_revocation)>128 or p_issuer is null or p_issuer!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or length(p_issuer)>128 or p_original_sha256 is null or p_original_sha256!~'^[0-9a-f]{64}$'then raise exception 'ACTOR_REGISTRY_REVOCATION_INVALID'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('WORLD_ACTOR_REGISTRY:'||p_world,0));
 select * into r from world_v2.world_actor_reader_scope_revocation where world_id=p_world and scope_ref=p_scope;
 if found then
  if r.revocation_ref is distinct from p_revocation or r.issuer_ref is distinct from p_issuer or r.original_sha256 is distinct from p_original_sha256 then raise exception 'ACTOR_REGISTRY_REVOCATION_CONFLICT'using errcode='23505';end if;
  return p_revocation;
 end if;
 insert into world_v2.world_actor_reader_scope_revocation(world_id,scope_ref,revocation_ref,issuer_ref,original_sha256,published_by)values(p_world,p_scope,p_revocation,p_issuer,p_original_sha256,who);
 return p_revocation;
end$$;
create function world_v2.read_world_actor_binding(p_world text,p_subject uuid)
returns table(world_id text,auth_subject text,actor_id text,binding_ref text,issuer_ref text,original_sha256 text)
language plpgsql security definer set search_path=pg_catalog,world_v2 as $$
declare who name;begin
 who:=world_v2.world_actor_registry_invoker('READ');
 if current_setting('transaction_read_only')<>'on'or current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'ACTOR_REGISTRY_STABLE_READ_ONLY_REQUIRED'using errcode='25001';end if;
 if p_subject is null or current_setting('request.jwt.claim.sub',true)is distinct from p_subject::text then raise exception 'ACTOR_REGISTRY_SUBJECT_MISMATCH'using errcode='42501';end if;
 if not exists(select 1 from world_v2.world_actor_reader_scope s where s.world_id=p_world and s.reader_role=who and not exists(select 1 from world_v2.world_actor_reader_scope_revocation v where v.world_id=s.world_id and v.scope_ref=s.scope_ref))then raise exception 'ACTOR_REGISTRY_READER_WORLD_NOT_CONFIGURED'using errcode='42501';end if;
 return query select b.world_id,b.auth_subject::text,b.actor_id,b.binding_ref,b.issuer_ref,b.original_sha256 from world_v2.world_actor_binding b where b.world_id=p_world and b.auth_subject=p_subject and not exists(select 1 from world_v2.world_actor_binding_revocation v where v.world_id=b.world_id and v.binding_ref=b.binding_ref);
end$$;

alter function world_v2.world_actor_registry_invoker(text)owner to world_v2_actor_registry_owner;
alter function world_v2.world_actor_registry_immutable()owner to world_v2_actor_registry_owner;
alter function world_v2.publish_world_actor_binding(text,uuid,text,text,text,text)owner to world_v2_actor_registry_owner;
alter function world_v2.revoke_world_actor_binding(text,text,text,text,text)owner to world_v2_actor_registry_owner;
alter function world_v2.publish_world_actor_reader_scope(text,text,name,text,text)owner to world_v2_actor_registry_owner;
alter function world_v2.revoke_world_actor_reader_scope(text,text,text,text,text)owner to world_v2_actor_registry_owner;
alter function world_v2.read_world_actor_binding(text,uuid)owner to world_v2_actor_registry_owner;
revoke all on function world_v2.world_actor_registry_invoker(text),world_v2.world_actor_registry_immutable(),world_v2.publish_world_actor_binding(text,uuid,text,text,text,text),world_v2.revoke_world_actor_binding(text,text,text,text,text),world_v2.publish_world_actor_reader_scope(text,text,name,text,text),world_v2.revoke_world_actor_reader_scope(text,text,text,text,text),world_v2.read_world_actor_binding(text,uuid)from public;
grant execute on function world_v2.publish_world_actor_binding(text,uuid,text,text,text,text),world_v2.revoke_world_actor_binding(text,text,text,text,text),world_v2.publish_world_actor_reader_scope(text,text,name,text,text),world_v2.revoke_world_actor_reader_scope(text,text,text,text,text)to world_v2_actor_registry_publisher;
grant execute on function world_v2.read_world_actor_binding(text,uuid)to world_v2_actor_registry_reader;
revoke create on schema world_v2 from world_v2_actor_registry_owner;
commit;
-- Recovery: stop dependent consumers, preserve bindings and revocations, review
-- a forward fix after a committed installation. An unknown publication outcome
-- requires inspecting the exact original reference before any retry.
