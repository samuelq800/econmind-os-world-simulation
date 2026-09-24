import { writeFile } from 'node:fs/promises';

import { Client } from 'pg';

import { assertV09DisposablePostgresEvidenceExecution } from './v09-staging-evidence-runner.mjs';

// Reuse the evidence runner's strict loopback/CI target guard. This script is
// read-only and is run only after its cleanup check fails in disposable CI.
const { approval, connectionString } =
  assertV09DisposablePostgresEvidenceExecution();
const outputPath = process.env.V09_DEPENDENCY_SUMMARY_OUTPUT;
if (
  typeof outputPath !== 'string' ||
  !outputPath.startsWith(`${process.env.RUNNER_TEMP}/`) ||
  !outputPath.endsWith('.json')
) {
  throw new Error('Expected an absolute runner-temp dependency summary path');
}

const client = new Client({ connectionString });
try {
  await client.connect();
  const result = await client.query(
    `with run_objects as (
       select 'pg_class'::regclass as class_id, c.oid as object_id
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1
       union all
       select 'pg_proc'::regclass as class_id, p.oid as object_id
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = $1
       union all
       select 'pg_type'::regclass as class_id, t.oid as object_id
         from pg_type t
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = $1
     )
     select d.classid::regclass::text as dependent_catalog,
            n.nspname as dependent_schema,
            dependent_relation.relkind::text as relation_kind,
            d.deptype as dependency_type,
            count(*)::integer as dependency_count
       from pg_depend d
       join run_objects r
         on r.class_id = d.refclassid and r.object_id = d.refobjid
       left join pg_class dependent_relation
         on d.classid = 'pg_class'::regclass
        and dependent_relation.oid = d.objid
       left join pg_attrdef dependent_default
         on d.classid = 'pg_attrdef'::regclass
        and dependent_default.oid = d.objid
       left join pg_policy dependent_policy
         on d.classid = 'pg_policy'::regclass
        and dependent_policy.oid = d.objid
       left join pg_proc dependent_routine
         on d.classid = 'pg_proc'::regclass
        and dependent_routine.oid = d.objid
       left join pg_type dependent_type
         on d.classid = 'pg_type'::regclass
        and dependent_type.oid = d.objid
       left join pg_operator dependent_operator
         on d.classid = 'pg_operator'::regclass
        and dependent_operator.oid = d.objid
       left join pg_constraint dependent_constraint
         on d.classid = 'pg_constraint'::regclass
        and dependent_constraint.oid = d.objid
       left join pg_rewrite dependent_rewrite
         on d.classid = 'pg_rewrite'::regclass
        and dependent_rewrite.oid = d.objid
       left join pg_trigger dependent_trigger
         on d.classid = 'pg_trigger'::regclass
        and dependent_trigger.oid = d.objid
       left join pg_class owner_relation
         on owner_relation.oid = coalesce(
           dependent_default.adrelid,
           dependent_policy.polrelid,
           dependent_constraint.conrelid,
           dependent_rewrite.ev_class,
           dependent_trigger.tgrelid
         )
       join pg_namespace n
         on n.oid = coalesce(
           dependent_relation.relnamespace,
           dependent_routine.pronamespace,
           dependent_type.typnamespace,
           dependent_operator.oprnamespace,
           owner_relation.relnamespace
         )
      where n.nspname <> $1
        and n.nspname <> 'information_schema'
        and n.nspname !~ '^pg_'
      group by d.classid, n.nspname, dependent_relation.relkind, d.deptype
      order by dependent_schema, dependent_catalog, relation_kind,
               dependency_type`,
    [approval.disposable_namespace],
  );
  const summary = {
    schema_version: 'V09_DISPOSABLE_DEPENDENCY_SUMMARY-2',
    evidence_scope: 'DISPOSABLE_LOOPBACK_POSTGRESQL',
    status: result.rows.length > 50 ? 'TRUNCATED' : 'CAPTURED',
    groups: result.rows.slice(0, 50),
  };
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      status: summary.status,
      group_count: summary.groups.length,
    }),
  );
} finally {
  await client.end();
}
