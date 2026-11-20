/** Explicit TEST_ONLY fixture bridge to the real controlled source publisher.
 * Imports do not open PG. It creates no role, membership, budget policy, MATCH
 * issuer, signature, identity or source fact. Call outside an outer transaction
 * on the already-owned cfc clone; runtime reader/writer pools are never used. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import {
  canonicalSerialize,
  isValidatedOpeningSeed,
  type OpeningSeed,
} from '@econmind/core';
import {
  derivePostwarFinanceSocialSources,
  publishPostwarFinanceSocialSources,
} from '../../apps/world-worker/src/persistence/postwar-finance-social-source-publication.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const sqlHash =
  '974bb060c64f024dfd0a85076292d2969e96b6fa437d0982ca90eee8e718d521';
const manifestHash =
  '4944efb3b58fad30e7456a1b391d6b34f1cd0090c91599ab513ba590b863747b';
function invalid(reason: string): never {
  throw Error('TEST_ONLY_FIXED_SOURCE_BRIDGE:' + reason);
}
/** Fixed role names only. Existing transaction/rollback/unknown-commit handling
 * is retained. SET LOCAL cannot leak a publisher role after COMMIT/ROLLBACK. */
function publisherDatabase(
  pool: Pool,
  role:
    | 'world_v2_finance_budget_source_publisher'
    | 'world_v2_social_source_publisher',
): SqlDatabase {
  const database = new PostgresSqlDatabase(pool);
  const transaction = <T>(
    consume: (tx: SqlExecutor) => Promise<T>,
  ): Promise<T> =>
    database.transaction(async (tx) => {
      await tx.query('set local role ' + role);
      return consume(tx);
    });
  return Object.freeze({
    query<Row extends object>(
      statement: string,
      parameters: readonly unknown[] = [],
    ) {
      return transaction((tx) => tx.query<Row>(statement, parameters));
    },
    transaction,
  });
}
export async function publishCfcFinanceSocialFixtureSources(input: {
  readonly seed: OpeningSeed;
  readonly installer: Pool;
}) {
  if (!isValidatedOpeningSeed(input.seed))
    invalid('GENUINE_CORE_SEED_REQUIRED');
  const database = (
    await input.installer.query<{ database: string }>(
      'select current_database() as database',
    )
  ).rows;
  if (
    database.length !== 1 ||
    !/^postwar_clone_[a-z0-9_]+$/u.test(database[0]!.database)
  )
    invalid('ALREADY_OWNED_ISOLATED_CLONE_REQUIRED');
  const [sql, manifestBytes] = await Promise.all([
    readFile(
      new URL(
        '../../database/proposals/postwar-finance-social-source-publication.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../../config/postwar-genesis/finance-social-source-manifest.v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);
  const manifest = JSON.parse(manifestBytes) as {
    seedFingerprint: string;
    canonicalSeedSha256: string;
    countries: { countryId: string; derivedSha256: string }[];
  };
  if (
    sha(sql) !== sqlHash ||
    sha(canonicalSerialize(manifest)) !== manifestHash
  )
    invalid('REVIEWED_SQL_AND_MANIFEST_BYTES_REQUIRED');
  const derivation = derivePostwarFinanceSocialSources(input.seed);
  if (
    derivation.seedFingerprint !== manifest.seedFingerprint ||
    derivation.canonicalSeedSha256 !== manifest.canonicalSeedSha256 ||
    canonicalSerialize(
      derivation.countries.map(({ countryId, derivedSha256 }) => ({
        countryId,
        derivedSha256,
      })),
    ) !== canonicalSerialize(manifest.countries)
  )
    invalid('COMPLETE_REAL_DERIVATION_MUST_MATCH_FIXED_MANIFEST');
  // Candidate DDL only in the explicit owned test clone. Never replace an
  // existing/unknown version. This bridge runs once during fresh fixture setup,
  // never on an online reader/writer connection.
  const installed = await input.installer.query<{ entry: string | null }>(
    "select to_regprocedure('world_v2.publish_postwar_finance_source_bounded(text)')::text as entry",
  );
  if (installed.rows[0]?.entry)
    invalid('FRESH_CLONE_WITHOUT_PREINSTALLED_CANDIDATE_REQUIRED');
  const installation = await input.installer.connect();
  let discard: Error | undefined;
  try {
    await installation.query(sql);
  } catch (cause) {
    try {
      await installation.query('rollback');
    } catch (rollback) {
      discard = new AggregateError(
        [cause, rollback],
        'FIXED_SOURCE_CANDIDATE_DDL_CLEANUP_UNCONFIRMED',
      );
      throw discard;
    }
    throw cause;
  } finally {
    installation.release(discard);
  }
  const financeDatabase = publisherDatabase(
    input.installer,
    'world_v2_finance_budget_source_publisher',
  );
  const socialDatabase = publisherDatabase(
    input.installer,
    'world_v2_social_source_publisher',
  );
  const publication = await publishPostwarFinanceSocialSources({
    derivation,
    financeDatabase,
    socialDatabase,
  });
  if (
    publication.results.length !== 140 ||
    new Set(publication.results.map((r) => r.countryId)).size !== 70
  )
    invalid('ACTUAL_COMPLETE_70_COUNTRY_PUBLICATION_REQUIRED');
  return Object.freeze({
    classification:
      'CONTROLLED_SOURCE_PUBLICATION_WITH_TEST_ONLY_ADMISSION_NOT_PRODUCTION' as const,
    seedFingerprint: derivation.seedFingerprint,
    canonicalSeedSha256: derivation.canonicalSeedSha256,
    manifestCanonicalSha256: manifestHash,
    proposalSha256: sqlHash,
    countryCount: 70,
    entryExecutions: publication.results.length,
    sourceRows: publication.results,
    remainingTestOnly: [
      'BUDGET_POLICY',
      'MATCH_PUBLISHER_GRANT',
      'RUNTIME_IDENTITIES',
    ] as const,
  });
}
