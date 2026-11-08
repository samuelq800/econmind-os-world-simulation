/** One bounded inspection on an already owned/upgraded clone. The fixed 5+2
 * upgrade and genuine live source publication remain explicit preceding steps.
 * No source adoption, seed parsing, Node, consumer, Clock or economic command. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import type { PostwarPhysicalSourceContext } from '../../apps/world-worker/src/preparation/postwar-physical-service-receipt.js';
import type { PostwarNativeReferenceMarker } from './postwar-native-reference-db.js';
import { createPostwarRefinery21AssemblyCheck } from './postwar-refinery21-source-assembly.js';

type ExistingClone = Readonly<{ database: string; installer: Pool }>;
const economicTables = [
  'world_head',
  'command_submission',
  'command_queue',
  'command_receipt',
  'authoritative_event',
  'financial_posting_batch',
  'inventory_posting',
] as const;

export async function inspectPostwarRefinery21RetainedClone(
  input: Readonly<{
    marker: PostwarNativeReferenceMarker;
    clone: ExistingClone;
    sourceContext: PostwarPhysicalSourceContext;
    workerRole: string;
    configureTestOnlyActors?: true;
  }>,
) {
  assert.equal(process.env.ECONMIND_REFINERY21_NATIVE, '1');
  assert.notEqual(input.clone.database, input.marker.database);
  assert.match(input.clone.database, /^postwar_clone_[a-z0-9_]+$/u);
  assert.match(input.workerRole, /^[a-z_][a-z0-9_]{0,62}$/u);
  const database = input.clone.installer;
  assert.equal(
    (await database.query('select current_database()as database')).rows[0]
      ?.database,
    input.clone.database,
  );
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of economicTables) {
      // Fixed compile-time names only; never a caller-supplied SQL identifier.
      result[table] = (
        await database.query(
          `select count(*)::text as count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n'order by to_jsonb(t)::text collate "C"),''),'UTF8')),'hex')as sha256 from world_v2.${table} t`,
        )
      ).rows;
    }
    return result;
  };
  const before = await snapshot();
  const checker = createPostwarRefinery21AssemblyCheck(input.sourceContext);
  const configured = input.configureTestOnlyActors
    ? await checker.configureTestOnlyInspectionActors({
        marker: input.marker,
        clone: input.clone,
      })
    : null;
  const worker = new Pool({
    host: input.marker.socket,
    port: input.marker.port,
    database: input.clone.database,
    user: input.workerRole,
    max: 1,
    ssl: false,
    password: async () => '',
    connectionTimeoutMillis: 10000,
    application_name: 'ECONMIND_REFINERY21_BOUNDED_INSPECTION_TEST_ONLY',
  });
  try {
    const inspection = await checker.inspect({
      database: new PostgresSqlDatabase(worker),
      workerRole: input.workerRole,
      pins: input.marker,
      ...(configured ? { actors: configured.actors } : {}),
    });
    if (configured)
      for (const site of inspection.sites) {
        assert.equal(
          site.actors.filter((a) => a.status === 'AUTHORIZED').length,
          1,
        );
        assert.equal(
          site.actors.filter((a) => a.status === 'CROSS_COUNTRY_DENIED').length,
          20,
        );
      }
    const after = await snapshot();
    assert.deepEqual(after, before, 'REFINERY21_ECONOMIC_ROWS_CHANGED');
    return Object.freeze({
      classification:
        'ACTUAL_RETAINED_SOURCE_SCOPE_INSPECTION_NOT_21_RUNTIME_EXECUTION',
      inspection,
      testOnlyActorConfiguration: configured,
      before,
      after,
      economicRowsSha256: createHash('sha256')
        .update(JSON.stringify(after))
        .digest('hex'),
      sourcePublication: 'NOT_PERFORMED_BY_RETAINED_INSPECTION',
      nodeStartup: 'NOT_RUN',
      workPaymentDeliveryProduction: 'NOT_RUN',
    });
  } finally {
    await worker.end();
  }
}
