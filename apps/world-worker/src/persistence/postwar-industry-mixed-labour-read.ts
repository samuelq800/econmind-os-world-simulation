/** Read-only facility headcount over the complete held Budget/Social/FX prefix.
 * This DATA view never issues a production labour observation, work evidence,
 * payment, resource entitlement, or command/commit capability. */
import { countryId, worldId } from '@econmind/core';
import {
  projectPostwarIndustryLabourAllocation,
  type PostwarIndustryLabourAllocation,
  type PostwarIndustryLabourScope,
} from './postwar-industry-labour-source.js';
import {
  consumePostwarMixedCurrentProjectionSnapshotFrom,
  isPostwarMixedCurrentProjectionSource,
  type PostwarMixedCurrentProjectionCoverage,
  type PostwarMixedCurrentProjectionSource,
} from './postwar-mixed-current-projection-publication.js';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { replayPreparedPostwarFinanceSocialFxFrom } from './prepared-postwar-finance-social-fx-replay.js';

export interface PostwarIndustryMixedLabourReadout {
  readonly classification: 'CURRENT_EMPLOYMENT_DATA_NOT_PRODUCTION_AUTHORITY';
  readonly allocation: PostwarIndustryLabourAllocation;
  /** Not queried/proven by an employment join. Null means unknown, never zero
   * work/cost or a denial/approval of independently governed operating rights. */
  readonly unresolved: Readonly<{
    paidOperatingCost: null;
    waterRights: null;
    powerRights: null;
    operatingRights: null;
  }>;
}

/** Pure DATA projection for real Core mixed-prefix evidence. It intentionally
 * cannot issue the legacy PostwarIndustryLabourObservation private brand. */
export function projectPostwarIndustryMixedLabourReadout(
  input: Parameters<typeof projectPostwarIndustryLabourAllocation>[0],
): Readonly<PostwarIndustryMixedLabourReadout> {
  return Object.freeze({
    classification: 'CURRENT_EMPLOYMENT_DATA_NOT_PRODUCTION_AUTHORITY',
    allocation: projectPostwarIndustryLabourAllocation(input),
    unresolved: Object.freeze({
      paidOperatingCost: null,
      waterRights: null,
      powerRights: null,
      operatingRights: null,
    }),
  });
}

export interface PostwarIndustryMixedLabourRead {
  readonly head: Readonly<{
    worldId: string;
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly seedPins: Readonly<{
    worldId: string;
    seedId: string;
    seedFingerprint: string;
    admissionRef: string;
  }>;
  readonly sourceRevision: string;
  readonly sourceChecksumsSha256: string;
  readonly coverage: Readonly<PostwarMixedCurrentProjectionCoverage>;
  readonly readout: Readonly<PostwarIndustryMixedLabourReadout>;
}
export interface PostwarIndustryMixedLabourReader {
  readFacility(
    scope: PostwarIndustryLabourScope,
  ): Promise<Readonly<PostwarIndustryMixedLabourRead>>;
  /** Drain this borrowed reader only. Never close its source, connection,
   * transaction pool, publisher database, or any other office consumer. */
  close(): Promise<void>;
}

export function createPostwarIndustryMixedLabourReader(config: {
  readonly worldId: string;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly mixedSource: Readonly<PostwarMixedCurrentProjectionSource>;
}): Readonly<PostwarIndustryMixedLabourReader> {
  const world = worldId(config.worldId),
    social = config.socialConnection,
    source = config.mixedSource;
  if (
    !isPostwarSocialRuntimeConnection(social, world) ||
    !isPostwarMixedCurrentProjectionSource(source) ||
    source.worldId !== world
  )
    throw Error('INDUSTRY_GENUINE_SAME_WORLD_MIXED_SOURCE_REQUIRED');
  let retired = false;
  let closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  return Object.freeze({
    readFacility(scope: PostwarIndustryLabourScope) {
      if (retired)
        return Promise.reject(Error('INDUSTRY_MIXED_LABOUR_READER_RETIRED'));
      const result = Promise.resolve().then(async () => {
        if (scope.worldId !== world)
          throw Error('INDUSTRY_EXACT_WORLD_SCOPE_REQUIRED');
        const country = countryId(scope.countryId);
        return source.withSnapshot(country, async (executor, snapshot) => {
          const facts = consumePostwarMixedCurrentProjectionSnapshotFrom(
              executor,
              snapshot,
            ),
            baseline = readPostwarSocialRuntimeFinancialReplayBase(
              social,
              world,
            ),
            b = consumePreparedPostwarSocialFinancialReplayBase(baseline);
          // Two genuine instances in the same World still cannot substitute
          // each other's preparation. The live snapshot must retain this exact
          // immutable E03 original, and every SQL/current-admission pin agrees.
          if (
            facts.document !== b.document ||
            facts.countryId !== country ||
            facts.head.worldId !== world ||
            facts.seedPins.worldId !== world ||
            facts.seedPins.seedId !== b.pins.seedRef ||
            facts.seedPins.seedFingerprint !== b.pins.contentHash ||
            facts.seedPins.admissionRef !== b.pins.admissionRef
          )
            throw Error('INDUSTRY_EXACT_LIVE_PREPARED_SOURCE_REQUIRED');
          // Snapshot DATA deliberately exposes no transferable Core proof.
          // Reuse the fixed replay in this same held transaction to obtain the
          // genuine evidence consumed by the existing pure facility join.
          const replay = await replayPreparedPostwarFinanceSocialFxFrom({
            executor,
            baseline,
            worldId: world,
            hostCountryId: country,
            officeId: 'SOCIAL',
            seedId: facts.seedPins.seedId,
            seedFingerprint: facts.seedPins.seedFingerprint,
            admissionRef: facts.seedPins.admissionRef,
            frames: facts.frames,
            expectedHead: facts.head,
          });
          return Object.freeze({
            head: facts.head,
            seedPins: facts.seedPins,
            sourceRevision: b.document.sourceRevision,
            sourceChecksumsSha256: b.document.inputs.sourceChecksumsSha256,
            coverage: facts.coverage,
            readout: projectPostwarIndustryMixedLabourReadout({
              scope,
              originals: b.document.inputs,
              evidence: replay.mixedPrefixEvidence,
              frames: facts.frames,
              head: facts.head,
            }),
          });
        });
      });
      pending.add(result);
      void result.then(
        () => pending.delete(result),
        () => pending.delete(result),
      );
      return result;
    },
    close() {
      if (closing) return closing;
      retired = true;
      closing = Promise.allSettled([...pending]).then(() => undefined);
      return closing;
    },
  });
}
