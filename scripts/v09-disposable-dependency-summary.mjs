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
            coalesce(identified.schema, '<none>') as dependent_schema,
            identified.type as dependent_type,
            d.deptype as dependency_type,
            count(*)::integer as dependency_count
       from pg_depend d
       join run_objects r
         on r.class_id = d.refclassid and r.object_id = d.refobjid
       cross join lateral pg_identify_object(
         d.classid, d.objid, d.objsubid
       ) identified
      where identified.schema <> $1
        and identified.schema <> 'information_schema'
        and identified.schema !~ '^pg_'
      group by d.classid, identified.schema, identified.type, d.deptype
      order by dependent_schema, dependent_catalog, dependent_type,
               dependency_type`,
    [approval.disposable_namespace],
  );
  const summary = {
    schema_version: 'V09_DISPOSABLE_DEPENDENCY_SUMMARY-1',
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
