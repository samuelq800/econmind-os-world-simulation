/** Controlled publication of actual existing people plus adopted eligibility.
 * This creates no staff, RUN, WORK, payment, water right or delivery. */
import { projectPostwarIndustryWaterServiceSource } from './postwar-industry-utility-service-source.js';
import type { SqlExecutor } from './sql-database.js';
export async function publishPostwarIndustryWaterServiceSourceFrom(
  tx: SqlExecutor,
  input: Parameters<typeof projectPostwarIndustryWaterServiceSource>[0],
): Promise<Readonly<{ sourceRef: string; sourceSha256: string }>> {
  const original = projectPostwarIndustryWaterServiceSource(input),
    result = await tx.query<{ source_ref: string; source_sha256: string }>(
      'select * from world_v2.publish_postwar_industry_water_service_source($1,$2)',
      [original.siteSource.worldId, original.firstdayOriginal.rawText],
    );
  if (
    result.rows.length !== 1 ||
    result.rows[0]!.source_ref !== original.firstdayOriginal.sourceRef ||
    result.rows[0]!.source_sha256 !== original.firstdayOriginal.rawSha256
  )
    throw Error('WATER_SERVICE_ACTUAL_SQL_PUBLICATION_DIFFERS');
  return Object.freeze({
    sourceRef: result.rows[0]!.source_ref,
    sourceSha256: result.rows[0]!.source_sha256,
  });
}
