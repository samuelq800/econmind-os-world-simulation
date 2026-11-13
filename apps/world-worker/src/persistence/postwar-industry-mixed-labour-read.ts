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
  isPostwarMixedCurrentProjectionSource,
  type PostwarMixedCurrentProjectionCoverage,
  type PostwarMixedCurrentProjectionSource,
} from './postwar-mixed-current-projection-publication.js';
import {
  isPostwarSocialRuntimeConnection,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { readPostwarIndustryMixedCurrentEvidenceFrom } from './postwar-industry-mixed-current-evidence.js';

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
          const checked = await readPostwarIndustryMixedCurrentEvidenceFrom(
              executor,
              snapshot,
              social,
            ),
            facts = checked.facts;
          if (facts.countryId !== country)
            throw Error('INDUSTRY_EXACT_LIVE_PREPARED_SOURCE_REQUIRED');
          return Object.freeze({
            head: facts.head,
            seedPins: facts.seedPins,
            sourceRevision: facts.document.sourceRevision,
            sourceChecksumsSha256: facts.document.inputs.sourceChecksumsSha256,
            coverage: facts.coverage,
            readout: projectPostwarIndustryMixedLabourReadout({
              scope,
              originals: facts.document.inputs,
              evidence: checked.evidence,
              frames: checked.evidenceFrames,
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
