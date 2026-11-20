/** Controlled offline originals publication. It creates no RUN/WORK/payment,
 * power booking or delivery; SQL independently re-derives the stored E03 rows. */
import { projectPostwarIndustryPowerServiceSource } from './postwar-industry-utility-service-source.js';
import type { PreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import type { PreparedPostwarIndustryUtilitySource } from './postwar-industry-utility-source.js';
import type { SqlExecutor } from './sql-database.js';
export async function publishPostwarIndustryPowerServiceSourceFrom(
  tx: SqlExecutor,
  input: Readonly<{
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    preparation: Readonly<PreparedPostwarIndustryUtilitySource>;
  }>,
): Promise<Readonly<{ sourceRef: string; sourceSha256: string }>> {
  const original = projectPostwarIndustryPowerServiceSource(input),
    result = await tx.query<{ source_ref: string; source_sha256: string }>(
      'select * from world_v2.publish_postwar_industry_power_service_source($1,$2)',
      [original.siteSource.worldId, original.firstdayOriginal.rawText],
    );
  if (
    result.rows.length !== 1 ||
    result.rows[0]!.source_ref !== original.firstdayOriginal.sourceRef ||
    result.rows[0]!.source_sha256 !== original.firstdayOriginal.rawSha256
  )
    throw Error('POWER_SERVICE_ACTUAL_SQL_PUBLICATION_DIFFERS');
  return Object.freeze({
    sourceRef: result.rows[0]!.source_ref,
    sourceSha256: result.rows[0]!.source_sha256,
  });
}
