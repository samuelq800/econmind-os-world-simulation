/** Offline controlled publication only. Never imported by the online store.
 * The full prefix is read by the genuine same-executor lifetime-bound reader;
 * Core evidence and submitted hash pins are validation, never DB authority. */
import { worldId, countryId } from '@econmind/core';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  readValidatedCanonicalLineageFrom,
} from './validated-canonical-lineage.js';
import {
  replayPostwarSharedOfficePrefix,
  deriveCurrentSocialCountryEvidence,
} from './postwar-shared-office-prefix.js';
import type { SqlExecutor } from './sql-database.js';
export const POSTWAR_SOCIAL_PREFIX_REDUCER_VERSION =
  'POSTWAR_SOCIAL_COMPLETE_PREFIX_SCOPE_V2' as const;
export const POSTWAR_SOCIAL_PREFIX_PUBLISH_QUERY =
  'select * from world_v2.publish_postwar_social_current_prefix_projection($1,$2,$3,$4)';
export interface PostwarSocialCurrentPrefixPublication {
  readonly classification: 'COMPLETE_CORE_REPLAY_AND_FIXED_SQL_PUBLICATION_NOT_ADMISSION';
  readonly head: Readonly<{
    worldId: string;
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly seed: Readonly<{ seedId: string; fingerprint: string }>;
  readonly countryId: string;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly documents: readonly Readonly<Record<string, unknown>>[];
}
export async function publishPostwarSocialCurrentPrefixProjectionsFrom(
  executor: SqlExecutor,
  input: {
    readonly reader: DurableV08LedgerLineageReader;
    readonly worldId: string;
    readonly countryIds: readonly string[];
  },
): Promise<readonly PostwarSocialCurrentPrefixPublication[]> {
  const world = worldId(input.worldId),
    countries = input.countryIds.map(countryId);
  if (
    !countries.length ||
    countries.length > 70 ||
    new Set(countries).size !== countries.length
  )
    throw Error(
      'POSTWAR_SOCIAL_PREFIX_UNIQUE_SERVER_COUNTRY_SELECTION_REQUIRED',
    );
  const locks = new Map<string, Record<string, unknown>>();
  for (const country of [...countries].sort()) {
    const lock = await executor.query<Record<string, unknown>>(
      'select * from world_v2.lock_postwar_social_current_prefix_publication($1,$2)',
      [world, country],
    );
    if (lock.rows.length !== 1)
      throw Error('POSTWAR_SOCIAL_PREFIX_PUBLICATION_SOURCE_REQUIRED');
    locks.set(country, lock.rows[0]!);
  }
  // One expensive genuine full read/replay for all server-selected countries.
  // The API reader never imports or invokes this offline batch factory.
  return withValidatedCanonicalLineageFrom(
    { reader: input.reader, executor, worldId: world },
    async (view) => {
      const lineage = readValidatedCanonicalLineageFrom(executor, view),
        opening = readPostwarOperatingGenesisFromSeed(lineage.seed);
      if (!opening.socialEmployment)
        throw Error('POSTWAR_SOCIAL_PREFIX_FULL_E03_REQUIRED');
      const shared = replayPostwarSharedOfficePrefix({
        lineage,
        document: opening.socialEmployment,
      });
      const publications: PostwarSocialCurrentPrefixPublication[] = [];
      for (const country of countries) {
        const evidence = deriveCurrentSocialCountryEvidence(shared, country),
          head = locks.get(country)!;
        if (
          shared.head.worldVersion !== head.world_version ||
          shared.head.eventSequence !== head.event_sequence ||
          shared.seed.fingerprint !== head.seed_fingerprint ||
          evidence.origin === null
        )
          throw Error('POSTWAR_SOCIAL_PREFIX_ACTUAL_ORIGIN_HEAD_REQUIRED');
        const result = await executor.query<Record<string, unknown>>(
          POSTWAR_SOCIAL_PREFIX_PUBLISH_QUERY,
          [
            world,
            country,
            shared.prefixFingerprint,
            evidence.knownEffectsFingerprint,
          ],
        );
        if (result.rows.length !== 2)
          throw Error('POSTWAR_SOCIAL_PREFIX_EXACT_DATASETS_REQUIRED');
        const hash =
          evidence.origin.commandType ===
          'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'
            ? evidence.lifecycleHash
            : evidence.employmentHash;
        for (const row of result.rows)
          if (
            row.materialization_hash !== hash ||
            String(row.origin_world_version) !==
              evidence.origin.worldVersionAfter ||
            String(row.world_version) !== shared.head.worldVersion ||
            String(row.event_sequence) !== shared.head.eventSequence
          )
            throw Error(
              'POSTWAR_SOCIAL_PREFIX_SQL_DIFFERS_FROM_COMPLETE_CORE_REPLAY',
            );
        publications.push(
          Object.freeze({
            classification:
              'COMPLETE_CORE_REPLAY_AND_FIXED_SQL_PUBLICATION_NOT_ADMISSION',
            head: shared.head,
            seed: shared.seed,
            countryId: country,
            prefixFingerprint: shared.prefixFingerprint,
            knownEffectsFingerprint: evidence.knownEffectsFingerprint,
            documents: Object.freeze(result.rows),
          }),
        );
      }
      return Object.freeze(publications);
    },
  );
}
export async function publishPostwarSocialCurrentPrefixProjectionFrom(
  executor: SqlExecutor,
  input: {
    readonly reader: DurableV08LedgerLineageReader;
    readonly worldId: string;
    readonly countryId: string;
  },
): Promise<PostwarSocialCurrentPrefixPublication> {
  const results = await publishPostwarSocialCurrentPrefixProjectionsFrom(
    executor,
    {
      reader: input.reader,
      worldId: input.worldId,
      countryIds: [input.countryId],
    },
  );
  return results[0]!;
}
