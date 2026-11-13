/** Fixed C10 TEST_ONLY original/HTTP attachment on an owned H0 clone.
 * Utility/power originals reuse the next cold Node's genuine proof separately. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import {
  loadPostwarIndustryFirstDayAdoptedPolicy,
  registerPostwarIndustryRefineryFirstDayFrom,
  readPostwarIndustryFirstDaySourceFrom,
} from '../../apps/world-worker/src/persistence/postwar-industry-first-day-source.js';
import { attachRegisteredC10IndustryCheckpoint } from './registered-c10-checkpoint-attachment.js';
import { readRegisteredCurrentEconomicSnapshotFrom } from './registered-current-read-repair-checkpoint.js';
export async function prepareFreshC10Checkpoint(
  input: Parameters<typeof attachRegisteredC10IndustryCheckpoint>[0] & {
    evidencePath: string;
  },
) {
  assert.equal(process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE, '1');
  const { marker: m, clone, descriptor: d } = input;
  assert.match(clone.database, /^postwar_clone_[a-z0-9_]+$/u);
  assert.equal(d.database, clone.database);
  assert.equal(d.worldId, m.worldId);
  const before = await readRegisteredCurrentEconomicSnapshotFrom(
    clone.installer,
    m.worldId,
  );
  const head = (
    await clone.installer.query<{
      world_version: string;
      event_sequence: string;
    }>(
      'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
      [m.worldId],
    )
  ).rows;
  assert.deepEqual(head, [{ world_version: '0', event_sequence: '0' }]);
  const open = (user: string) =>
    new Pool({
      host: m.socket,
      port: m.port,
      database: clone.database,
      user,
      max: 1,
      ssl: false,
      password: async () => '',
      idleTimeoutMillis: 1000,
    });
  const worker = open(d.workerRole),
    publisher = open(d.industryPublicationRole);
  const reader = new PostgresSqlDatabase(worker),
    publication = new PostgresSqlDatabase(publisher);
  const read = () =>
    reader.transaction(async (tx) => {
      await tx.query('set transaction isolation level repeatable read');
      await tx.query('set local role world_v2_industry_source_reader');
      return readPostwarIndustryFirstDaySourceFrom(tx, {
        worldId: m.worldId,
        countryId: 'COUNTRY_10',
        facilityId: 'OPEN-10-REFINED_FUEL',
        head: { worldVersion: '0', eventSequence: '0' },
        expectedPins: {
          seedId: m.seedId,
          seedFingerprint: m.seedFingerprint,
          admissionRef: m.admissionRef,
        },
      });
    });
  let original,
    status = 'REUSED_VERIFIED';
  try {
    original = await read();
    if (!original) {
      const sourceContext = await loadPostwarSourceContext(d.repositoryRoot);
      const adoptedPolicy = await loadPostwarIndustryFirstDayAdoptedPolicy(
        d.repositoryRoot,
      );
      await publication.transaction(async (tx) => {
        await tx.query('set transaction isolation level repeatable read');
        await tx.query('set local role world_v2_industry_source_publisher');
        const profile = await tx.query<{
          safe: boolean;
          publisher: boolean;
          owner: boolean;
        }>(
          "select not(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication)safe,pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')publisher,pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')owner from pg_roles where rolname=session_user",
        );
        assert.deepEqual(profile.rows, [
          { safe: true, publisher: true, owner: false },
        ]);
        return registerPostwarIndustryRefineryFirstDayFrom(tx, {
          worldId: m.worldId,
          countryId: 'COUNTRY_10',
          facilityId: 'OPEN-10-REFINED_FUEL',
          adoptedPolicy,
          sourceContext,
        });
      });
      status = 'COMMITTED';
      original = await read();
      assert(original, 'C10_REGISTERED_ORIGINAL_READBACK_REQUIRED');
    }
  } finally {
    await Promise.all([worker.end(), publisher.end()]);
  }
  const attachment = await attachRegisteredC10IndustryCheckpoint({
    ...input,
    repairMissingOpeningBases: true,
  });
  const after = await readRegisteredCurrentEconomicSnapshotFrom(
    clone.installer,
    m.worldId,
  );
  assert.deepEqual(
    after.economic,
    before.economic,
    'C10_SOURCE_ATTACHMENT_CHANGED_ECONOMIC_STATE',
  );
  const receipt = {
    classification:
      'ACTUAL_C10_ORIGINAL_AND_TEST_HTTP_ATTACHMENT_NOT_UTILITY_OR_PRODUCTION',
    status,
    sourceRef: original.sourceRef,
    sourceRawSha256: original.rawSha256,
    attachment: attachment.receipt,
    before,
    after,
    utilityAndPower: 'REQUIRE_NEXT_COLD_PROOF_PREPARATION',
  };
  await writeFile(input.evidencePath, JSON.stringify(receipt, null, 2) + '\n');
  return {
    ...attachment,
    descriptor: { ...attachment.descriptor, prepareC10Sources: true },
    receipt,
  };
}
