-- Read-only catalog snapshot. No user rows, function execution, or credentials.
-- Compare immediately before/after release; a mismatch requires investigation.
with protected_namespaces as (
  select oid, nspname, nspowner, nspacl
  from pg_namespace where nspname in ('public', 'auth', 'storage')
), objects as (
  select 'namespace' as kind, nspname as identity, to_jsonb(n)::text as definition
  from protected_namespaces n
  union all
  select 'relation', n.nspname || '.' || c.relname,
    jsonb_build_object('kind', c.relkind, 'owner', c.relowner,
      'acl', c.relacl, 'rls', c.relrowsecurity,
      'forceRls', c.relforcerowsecurity, 'options', c.reloptions)::text
  from pg_class c join protected_namespaces n on n.oid = c.relnamespace
  union all
  select 'column', n.nspname || '.' || c.relname || '.' || a.attname,
    jsonb_build_object('type', format_type(a.atttypid, a.atttypmod),
      'number', a.attnum, 'notNull', a.attnotnull, 'acl', a.attacl,
      'identity', a.attidentity, 'generated', a.attgenerated,
      'default', pg_get_expr(d.adbin, d.adrelid))::text
  from pg_attribute a join pg_class c on c.oid = a.attrelid
  join protected_namespaces n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped
  union all
  select 'constraint', n.nspname || '.' || c.conrelid::text || '.' || c.conname,
    pg_get_constraintdef(c.oid)
  from pg_constraint c join protected_namespaces n on n.oid = c.connamespace
  union all
  select 'function', n.nspname || '.' || p.oid::text,
    jsonb_build_object('body', pg_get_functiondef(p.oid),
      'owner', p.proowner, 'acl', p.proacl)::text
  from pg_proc p join protected_namespaces n on n.oid = p.pronamespace
  where p.prokind in ('f', 'p')
  union all
  select 'trigger', n.nspname || '.' || t.tgrelid::text || '.' || t.tgname,
    jsonb_build_object('body', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled)::text
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join protected_namespaces n on n.oid = c.relnamespace
  union all
  select 'policy', n.nspname || '.' || p.polrelid::text || '.' || p.polname,
    to_jsonb(p)::text
  from pg_policy p join pg_class c on c.oid = p.polrelid
  join protected_namespaces n on n.oid = c.relnamespace
  union all
  select 'index', n.nspname || '.' || i.indexrelid::text, pg_get_indexdef(i.indexrelid)
  from pg_index i join pg_class c on c.oid = i.indrelid
  join protected_namespaces n on n.oid = c.relnamespace
)
select current_database() as database_name, current_user as execution_role,
  current_setting('server_version') as postgres_version,
  to_regnamespace('world_v2') is not null as world_v2_exists,
  to_regprocedure('public.get_world_preseason_my_team()') is not null as season1_rpc_exists,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')) as public_table_count,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'world_v2' and c.relkind in ('r', 'p')) as world_v2_table_count,
  (select count(*) from objects) as protected_catalog_object_count,
  (select md5(string_agg(kind || ':' || identity || ':' || definition, E'\n'
    order by kind, identity, definition)) from objects) as protected_catalog_fingerprint;
