/** Complete bounded current canonical prefix, DATA only. The fixed SQL reader
 * holds actual World/admission/host-source locks and returns all domain frames;
 * the common decoder checks canonical commands, events, receipts and postings.
 * No raw table privilege, seed hydration, skipped family or authority is added.
 */
import { readBoundedPostwarCanonicalPrefixFrom } from './bounded-postwar-canonical-prefix.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

export function readBoundedPostwarSocialFramesFrom(input: {
  readonly executor: SqlExecutor;
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly countryId: string;
}) {
  return readBoundedPostwarCanonicalPrefixFrom(input.executor, {
    worldId: input.worldId,
    countryId: input.countryId,
    officeId: 'SOCIAL',
  });
}
