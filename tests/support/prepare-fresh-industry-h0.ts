/** Existing controlled SQL only: missing regional DATA pages, then genuine
 * seventy-country H0 labour scopes. No economic command or paid facts. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { PostwarNativeReferenceMarker } from './postwar-native-reference-db.js';
export async function prepareFreshIndustryH0(input: {
  marker: PostwarNativeReferenceMarker;
  clone: { database: string; installer: Pool };
  publisherRole: string;
  evidencePath: string;
}) {
  assert.equal(process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE, '1');
  assert.match(input.clone.database, /^postwar_clone_[a-z0-9_]+$/u);
  const world = input.marker.worldId,
    admin = input.clone.installer;
  const head = async () =>
    (
      await admin.query(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [world],
      )
    ).rows;
  const before = await head();
  assert.deepEqual(before, [{ world_version: '0', event_sequence: '0' }]);
  const countries = (
    await admin.query<{ country_id: string; has_regional: boolean }>(
      "select s.country_id,exists(select 1 from world_v2.postwar_office_projection_document d where d.world_id=s.world_id and d.country_id=s.country_id and d.office_id='INDUSTRY' and d.dataset='regional-source-capacity')has_regional from world_v2.postwar_social_prefix_scope s where s.world_id=$1 order by s.country_id",
      [world],
    )
  ).rows;
  assert.equal(countries.length, 70);
  const report: Record<string, unknown> = {
    classification: 'ACTUAL_H0_DERIVED_DATA_NOT_ECONOMIC_EXECUTION',
    database: input.clone.database,
    before,
    existingRegions: countries.filter((c) => c.has_regional).length,
    committed: [],
    scopes: 'NOT_RUN',
  };
  const save = () =>
    writeFile(input.evidencePath, JSON.stringify(report, null, 2) + '\n');
  await save();
  const publisher = new Pool({
    host: input.marker.socket,
    port: input.marker.port,
    database: input.clone.database,
    user: input.publisherRole,
    max: 1,
    ssl: false,
    password: async () => '',
  });
  const execute = async (
    label: string,
    sql: string,
    values: readonly string[],
  ) => {
    const client = await publisher.connect();
    try {
      await client.query('begin isolation level repeatable read');
      await client.query(
        'set local role world_v2_postwar_projection_publisher',
      );
      const result = await client.query(sql, [...values]);
      report.pending = { label, status: 'COMMIT_RESULT_UNKNOWN' };
      await save();
      await client.query('commit');
      delete report.pending;
      (report.committed as unknown[]).push({
        label,
        status: 'COMMITTED',
        rows: result.rows,
      });
      await save();
    } catch (error) {
      await client.query('rollback');
      report.error = {
        label,
        message: String(error),
        status: 'STOP_INSPECT_BEFORE_RETRY',
      };
      await save();
      throw error;
    } finally {
      client.release();
    }
  };
  try {
    for (const country of countries.filter((c) => !c.has_regional))
      await execute(
        country.country_id,
        'select country_id,total_rows,document_ref,document_sha256 from world_v2.repair_postwar_industry_regional_source_capacity($1,$2)',
        [world, country.country_id],
      );
    await execute(
      'INDUSTRY_LABOUR_SCOPES',
      'select world_v2.prepare_postwar_industry_labour_scopes($1)',
      [world],
    );
    const counts = (
      await admin.query(
        'select (select count(*)::text from world_v2.postwar_industry_labour_scope where world_id=$1)scopes,(select count(distinct country_id)::text from world_v2.postwar_industry_labour_document where world_id=$1 and world_version=0 and event_sequence=0)h0_countries',
        [world],
      )
    ).rows;
    assert.deepEqual(counts, [{ scopes: '70', h0_countries: '70' }]);
    assert.deepEqual(await head(), before);
    report.scopes = counts;
    report.status = 'PASSED_SEVENTY_COUNTRY_H0_DERIVED_PREPARATION';
    await save();
    return report;
  } finally {
    await publisher.end();
  }
}
