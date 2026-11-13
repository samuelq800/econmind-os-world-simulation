/** Fixed Industry installation over genuine immutable source DATA. No command
 * handler, caller factory, preparation callback, payment or permission issuer. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  type CanonicalCommand,
  type WorldWriterCommitAssertion,
} from '@econmind/core';
import { parseIndustryProductionIntent } from '@econmind/core/industry-production-command';
import type { AtomicTransitionCandidateFactory } from './atomic-transition-repository.js';
import type { IndustryProductionCutoffGuard } from './industry-production-source-cutoff.js';
import { createPostwarIndustryProductionCandidateFactory } from './postwar-industry-production-candidate-factory.js';
import {
  isPostwarIndustryOperatingCutoffGuard,
  type PostwarIndustryOperatingCutoffGuard,
} from './postwar-industry-operating-cutoff.js';
import {
  isIndustrySettledPaymentDataPreparation,
  readIndustrySettledPaymentDataForCommand,
  type IndustrySettledPaymentDataPreparation,
} from './postwar-industry-settled-payment-receipt.js';
import {
  createPostwarIndustryMixedLabourReader,
  type PostwarIndustryMixedLabourRead,
} from './postwar-industry-mixed-labour-read.js';
import {
  consumePostwarMixedCurrentProjectionSnapshotFrom,
  isPostwarMixedCurrentProjectionSource,
  type PostwarMixedCurrentProjectionSource,
} from './postwar-mixed-current-projection-publication.js';
import {
  createPostwarIndustryProductionSource,
  type PostwarIndustrySourceObservation,
  type PostwarIndustryMissingFactCode,
} from './postwar-industry-production-source.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import type { PostwarPhysicalSourceContext } from '../preparation/postwar-physical-service-receipt.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type { PostwarIndustryLabourScope } from './postwar-industry-labour-source.js';
import {
  createPostwarIndustryDynamicProductionRuntime,
  IndustryDynamicProductionMissing,
  type PostwarIndustryDynamicProductionInspection,
} from './postwar-industry-dynamic-production.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const issued = new WeakMap<object, Readonly<PostwarSocialRuntimeConnection>>();
const guards = new WeakSet<object>();
const preparedRuntimes = new WeakSet<object>();
export interface PostwarIndustryPreparedRun {
  readonly command: CanonicalCommand;
  readonly preparation: IndustrySettledPaymentDataPreparation;
  readonly sourceGuard: Readonly<PostwarIndustryOperatingCutoffGuard>;
  readonly commitAssertion: WorldWriterCommitAssertion;
  readonly water?: NonNullable<
    Parameters<
      typeof createPostwarIndustryProductionCandidateFactory
    >[0]['water']
  >;
}
export interface PostwarIndustryRuntimeInspection {
  readonly classification: 'SOURCE_AND_EMPLOYMENT_DATA_NOT_OPERATING_AUTHORITY';
  readonly source: Readonly<PostwarIndustrySourceObservation>;
  readonly preparedRun: 'EXACT_GENUINE_CORE_DATA' | 'MISSING';
  readonly missing: readonly (
    | PostwarIndustryMissingFactCode
    | 'GENUINE_PREPARED_RUN_MISSING'
    | 'ACTUAL_COMPLETED_WORK_MISSING'
    | 'ACTUAL_PAID_WORK_WAGE_MISSING'
    | 'DYNAMIC_PRODUCTION_DATA_MISSING'
  )[];
  readonly dynamicProduction?: Readonly<PostwarIndustryDynamicProductionInspection>;
  readonly submitted: false;
  readonly queued: false;
}
export class PostwarIndustryRuntimeMissing extends Error {
  readonly code = 'INDUSTRY_RUNTIME_SOURCE_MISSING';
  readonly submitted = false;
  readonly queued = false;
  constructor(readonly missing: readonly string[]) {
    super('INDUSTRY_RUNTIME_SOURCE_MISSING:' + missing.join(','));
  }
}
export interface PostwarIndustryRuntime {
  readonly worldId: string;
  readonly database: SqlDatabase;
  readonly candidateFactory: Readonly<AtomicTransitionCandidateFactory>;
  readonly cutoffGuard: Readonly<IndustryProductionCutoffGuard>;
  prepare(): Promise<void>;
  /** One real snapshot transaction, never a nested pool connection or admission. */
  inspect(
    command: CanonicalCommand,
  ): Promise<Readonly<PostwarIndustryRuntimeInspection>>;
  readFacility(
    scope: PostwarIndustryLabourScope,
  ): Promise<Readonly<PostwarIndustryMixedLabourRead>>;
  close(): Promise<void>;
}
export function isPostwarIndustryRuntime(
  value: unknown,
): value is Readonly<PostwarIndustryRuntime> {
  if (!value || typeof value !== 'object') return false;
  const social = issued.get(value);
  return !!social && isPostwarSocialRuntimeConnection(social, social.worldId);
}
export function isPreparedPostwarIndustryRuntime(
  value: unknown,
): value is Readonly<PostwarIndustryRuntime> {
  return isPostwarIndustryRuntime(value) && preparedRuntimes.has(value);
}
export function isPostwarIndustryRuntimeCutoffGuard(
  value: unknown,
): value is Readonly<IndustryProductionCutoffGuard> {
  return !!value && typeof value === 'object' && guards.has(value);
}
export function createPostwarIndustryRuntime(
  input: Readonly<{
    worldId: string;
    database: SqlDatabase;
    socialConnection: Readonly<PostwarSocialRuntimeConnection>;
    mixedSource: Readonly<PostwarMixedCurrentProjectionSource>;
    sourceContext: PostwarPhysicalSourceContext;
    /** Server-held genuine Core preparations only. Empty means no adopted run;
     * HTTP facility/run references cannot populate or alter this finite registry. */
    preparedRuns?: readonly Readonly<PostwarIndustryPreparedRun>[];
  }>,
): Readonly<PostwarIndustryRuntime> {
  const social = input.socialConnection,
    source = input.mixedSource,
    world = input.worldId;
  if (
    !isPostwarSocialRuntimeConnection(social, world) ||
    !isPostwarMixedCurrentProjectionSource(source) ||
    source.worldId !== world
  )
    throw Error('INDUSTRY_GENUINE_SAME_WORLD_SOURCES_REQUIRED');
  const runs = new Map<string, Readonly<PostwarIndustryPreparedRun>>();
  const factories = new Map<
    string,
    Readonly<AtomicTransitionCandidateFactory>
  >();
  if ((input.preparedRuns?.length ?? 0) > 256)
    throw Error('INDUSTRY_BOUNDED_RUN_REGISTRY_REQUIRED');
  for (const original of input.preparedRuns ?? []) {
    const terms = parseIndustryProductionIntent(original.command, sha);
    if (
      original.command.worldId !== world ||
      !isIndustrySettledPaymentDataPreparation(original.preparation) ||
      !isPostwarIndustryOperatingCutoffGuard(original.sourceGuard)
    )
      throw Error(
        'INDUSTRY_GENUINE_CORE_PREPARATION_AND_FIXED_CUTOFF_REQUIRED',
      );
    const data = readIndustrySettledPaymentDataForCommand(
      original.preparation,
      original.command,
    );
    if (
      data.seed.worldId !== world ||
      data.target.posting.evidence.runId !== terms.runId ||
      data.target.posting.evidence.operating.payload.facilityRef !==
        terms.facilityId ||
      runs.has(original.command.fingerprint)
    )
      throw Error('INDUSTRY_EXACT_UNIQUE_RUN_SCOPE_REQUIRED');
    const run = Object.freeze({ ...original });
    runs.set(run.command.fingerprint, run);
    factories.set(
      run.command.fingerprint,
      createPostwarIndustryProductionCandidateFactory(run),
    );
  }
  const originals = new Map<
    string,
    ReturnType<typeof createPostwarIndustryProductionSource>
  >();
  const labour = createPostwarIndustryMixedLabourReader({
    worldId: world,
    socialConnection: social,
    mixedSource: source,
  });
  const dynamic = createPostwarIndustryDynamicProductionRuntime({
      worldId: world,
      database: input.database,
      socialConnection: social,
    }),
    workerRole = readPostwarSocialRuntimeConnectionResources(social).workerRole;
  let retired = false,
    closing: Promise<void> | undefined;
  let immutable:
    | ReturnType<typeof consumePreparedPostwarSocialFinancialReplayBase>
    | undefined;
  const pending = new Set<Promise<unknown>>();
  const live = () => {
    if (retired || !isPostwarSocialRuntimeConnection(social, world))
      throw Error('INDUSTRY_RUNTIME_RETIRED');
    const actual = consumePreparedPostwarSocialFinancialReplayBase(
      readPostwarSocialRuntimeFinancialReplayBase(social, world),
    );
    if (!immutable)
      throw new PostwarIndustryRuntimeMissing([
        'IMMUTABLE_SOURCE_NOT_PREPARED',
      ]);
    if (
      actual.prepared !== immutable.prepared ||
      canonicalSerialize(actual.pins) !== canonicalSerialize(immutable.pins)
    )
      throw Error('INDUSTRY_IMMUTABLE_SOURCE_CHANGED');
    return actual;
  };
  const track = <T>(action: () => Promise<T>): Promise<T> => {
    if (retired) return Promise.reject(Error('INDUSTRY_RUNTIME_RETIRED'));
    const task = Promise.resolve().then(action);
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
    return task;
  };
  const runFor = (command: CanonicalCommand) => {
    const baseline = live();
    parseIndustryProductionIntent(command, sha);
    const run = runs.get(command.fingerprint);
    if (!run)
      throw new PostwarIndustryRuntimeMissing(['GENUINE_PREPARED_RUN_MISSING']);
    const data = readIndustrySettledPaymentDataForCommand(
      run.preparation,
      command,
    );
    if (
      data.seed.seedId !== baseline.pins.seedRef ||
      data.seed.fingerprint !== baseline.pins.contentHash ||
      data.seed.worldId !== world
    )
      throw Error('INDUSTRY_EXACT_ADMITTED_PREPARATION_REQUIRED');
    return run;
  };
  const candidateFactory: Readonly<AtomicTransitionCandidateFactory> =
    Object.freeze({
      prepare(
        candidate: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
      ) {
        return track(async () => {
          live();
          if (!runs.has(candidate.command.fingerprint))
            return dynamic.candidateFactory.prepare(candidate);
          runFor(candidate.command);
          return factories
            .get(candidate.command.fingerprint)!
            .prepare(candidate);
        });
      },
    });
  const cutoffGuard: Readonly<IndustryProductionCutoffGuard> = Object.freeze({
    assertCurrentFrom(
      tx: SqlExecutor,
      request: Parameters<
        IndustryProductionCutoffGuard['assertCurrentFrom']
      >[1],
    ) {
      return track(async () => {
        live();
        if (!runs.has(request.command.fingerprint))
          return dynamic.cutoffGuard.assertCurrentFrom(tx, request);
        const run = runFor(request.command),
          data = readIndustrySettledPaymentDataForCommand(
            run.preparation,
            request.command,
          );
        // A preparation is DATA. Actual paid prefix, source-purpose, operating
        // receipts and all native source locks are independently reread by this
        // existing genuine guard on Atomic's current executor, after lease/H/auth.
        run.sourceGuard.preparePaymentData(data);
        return run.sourceGuard.assertCurrentFrom(tx, request);
      });
    },
  });
  const runtime: Readonly<PostwarIndustryRuntime> = Object.freeze({
    worldId: world,
    database: input.database,
    candidateFactory,
    cutoffGuard,
    prepare() {
      return track(async () => {
        if (!isPostwarSocialRuntimeConnection(social, world))
          throw Error('INDUSTRY_RUNTIME_RETIRED');
        const actual = consumePreparedPostwarSocialFinancialReplayBase(
          readPostwarSocialRuntimeFinancialReplayBase(social, world),
        );
        if (immutable && immutable.prepared !== actual.prepared)
          throw Error('INDUSTRY_IMMUTABLE_SOURCE_CHANGED');
        for (const run of runs.values()) {
          const data = readIndustrySettledPaymentDataForCommand(
            run.preparation,
            run.command,
          );
          if (
            data.seed.seedId !== actual.pins.seedRef ||
            data.seed.fingerprint !== actual.pins.contentHash
          )
            throw Error('INDUSTRY_EXACT_ADMITTED_PREPARATION_REQUIRED');
        }
        immutable = actual;
        preparedRuntimes.add(runtime);
      });
    },
    inspect(command: CanonicalCommand) {
      return track(async () => {
        const baseline = live(),
          terms = parseIndustryProductionIntent(command, sha);
        if (command.worldId !== world)
          throw Error('INDUSTRY_EXACT_COMMAND_WORLD_REQUIRED');
        return source.withSnapshot(command.countryId, async (tx, token) => {
          const current = consumePostwarMixedCurrentProjectionSnapshotFrom(
            tx,
            token,
          );
          if (
            current.document !== baseline.document ||
            current.seedPins.seedId !== baseline.pins.seedRef ||
            current.seedPins.seedFingerprint !== baseline.pins.contentHash ||
            current.seedPins.admissionRef !== baseline.pins.admissionRef ||
            current.head.worldVersion !== command.expectedWorldVersion
          )
            throw Error('INDUSTRY_ACTUAL_CURRENT_SOURCE_HEAD_REQUIRED');
          let original = originals.get(command.countryId);
          if (!original) {
            original = createPostwarIndustryProductionSource({
              sourceContext: input.sourceContext,
              scope: { worldId: world, countryId: command.countryId },
              runtimeReaderRole: 'world_v2_industry_source_reader',
            });
            originals.set(command.countryId, original);
          }
          // The snapshot already owns the actual SQL transaction. Delegate only
          // the fixed Industry original reader and restore its exact source role.
          const observation = await withIndustryReader(tx, () =>
            original!.readForCommandFrom(tx, {
              command,
              facilityId: terms.facilityId,
              eventSequence: current.head.eventSequence,
            }),
          );
          if (
            observation.seedFingerprint !== baseline.pins.contentHash ||
            observation.admissionRef !== baseline.pins.admissionRef
          )
            throw Error('INDUSTRY_ORIGINAL_ADMISSION_DIFFERS');
          const run = runs.get(command.fingerprint);
          if (run) runFor(command);
          let dynamicProduction:
              Readonly<PostwarIndustryDynamicProductionInspection> | undefined,
            dynamicMissing: readonly (
              | 'ACTUAL_COMPLETED_WORK_MISSING'
              | 'ACTUAL_PAID_WORK_WAGE_MISSING'
              | 'DYNAMIC_PRODUCTION_DATA_MISSING'
            )[] = [];
          if (!run) {
            await tx.query('set local role "' + workerRole + '"');
            let failure: unknown;
            try {
              dynamicProduction = await dynamic.inspectFrom(tx, command);
            } catch (error) {
              failure = error;
            }
            try {
              await tx.query('set local role world_v2_social_source_reader');
            } catch (restore) {
              if (failure !== undefined)
                throw new AggregateError(
                  [failure, restore],
                  'Industry dynamic role restore failed',
                  { cause: restore },
                );
              throw restore;
            }
            if (failure !== undefined) {
              if (failure instanceof IndustryDynamicProductionMissing) {
                dynamicMissing = failure.missing.map((f) =>
                  f.code === 'ACTUAL_COMPLETED_WORK_MISSING'
                    ? 'ACTUAL_COMPLETED_WORK_MISSING'
                    : f.code === 'ACTUAL_PAID_WORK_WAGE_MISSING'
                      ? 'ACTUAL_PAID_WORK_WAGE_MISSING'
                      : 'DYNAMIC_PRODUCTION_DATA_MISSING',
                );
              } else throw failure;
            }
          }
          return Object.freeze({
            classification:
              'SOURCE_AND_EMPLOYMENT_DATA_NOT_OPERATING_AUTHORITY' as const,
            source: observation,
            preparedRun:
              run || dynamicProduction
                ? ('EXACT_GENUINE_CORE_DATA' as const)
                : ('MISSING' as const),
            missing: Object.freeze([
              ...observation.inspected.missing.map((f) => f.code),
              ...(run || dynamicProduction
                ? []
                : dynamicMissing.length
                  ? dynamicMissing
                  : ['GENUINE_PREPARED_RUN_MISSING' as const]),
            ]),
            ...(dynamicProduction ? { dynamicProduction } : {}),
            submitted: false as const,
            queued: false as const,
          });
        });
      });
    },
    readFacility(scope: PostwarIndustryLabourScope) {
      return track(async () => {
        live();
        return labour.readFacility(scope);
      });
    },
    close() {
      if (closing) return closing;
      retired = true;
      issued.delete(runtime);
      guards.delete(cutoffGuard);
      preparedRuntimes.delete(runtime);
      closing = (async () => {
        await Promise.allSettled([...pending]);
        try {
          await Promise.all([labour.close(), dynamic.close()]);
        } finally {
          runs.clear();
          factories.clear();
          originals.clear();
          immutable = undefined;
        }
      })();
      return closing;
    },
  });
  issued.set(runtime, social);
  guards.add(cutoffGuard);
  return runtime;
}
async function withIndustryReader<T>(
  tx: SqlExecutor,
  consume: () => Promise<T>,
): Promise<T> {
  const state = await tx.query<{ role_name: string }>(
    'select current_user as role_name',
  );
  if (
    state.rows.length !== 1 ||
    state.rows[0]?.role_name !== 'world_v2_social_source_reader'
  )
    throw Error('INDUSTRY_HELD_SOURCE_ROLE_REQUIRED');
  await tx.query(
    "select set_config('role','world_v2_industry_source_reader',true)",
  );
  try {
    return await consume();
  } finally {
    await tx.query(
      "select set_config('role','world_v2_social_source_reader',true)",
    );
  }
}
