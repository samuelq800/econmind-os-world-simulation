/** Actual fixed SQL page transport → same Core domain fold. No full seed,
 * all-history frame array, skipped family or caller-supplied current state. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  SOCIAL_SERVICE_PLAN_EVENT,
  canonicalHashInput,
  canonicalSha256,
  parseSocialEmploymentServiceCommand,
  type SocialEmploymentReadFacts,
} from '@econmind/core';
import type {
  FinanceNativeBudgetCanonicalFrame,
  FinanceNativeBudgetMixedPrefixResult,
} from '@econmind/core/finance-budget-native';
import type { PostwarSocialEmploymentStateDocument } from '../preparation/postwar-social-employment-state.js';
import { assertSocialPhysicalAttemptEnvelope } from './social-physical-attempt-envelope.js';
import { readPreparedFinanceSocialOpening } from '@econmind/core/finance-social-prepared-ledger';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  retireFinanceSocialReplayContinuation,
  type FinanceSocialReplayContinuation,
  type FinanceSocialReplayContinuationView,
} from '@econmind/core/finance-social-replay-continuation';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import {
  readPreparedPostwarFinanceSocialFxPageOriginalsFrom,
  projectPostwarOpeningFinancialEncumbrances,
  type PreparedPostwarFinanceSocialFxReplayRequest,
} from './prepared-postwar-finance-social-fx-replay.js';
import { createPostwarBoundedPrefixPageReaderFrom } from './postgres-postwar-bounded-prefix-pages.js';
import { readPostwarBeneficialHousingRentMixedOriginalsForSocialBase } from './postwar-beneficial-housing-rent-mixed-source.js';
import {
  createPostwarPagedCurrentProof,
  advancePostwarPagedCurrentProof,
  readPostwarPagedCurrentProof,
  retirePostwarPagedCurrentProof,
  type PostwarPagedCurrentProof,
} from './postwar-paged-current-proof.js';
import type { PostwarCaptainOriginalStatus } from './postwar-captain-history-originals.js';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { createPostwarSocialSourceRoleScope } from './postwar-social-position-runtime.js';
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Paged mixed replay: ' + reason,
  );
}
export interface PostwarPagedFinanceSocialReplay {
  readonly classification: 'COMPLETE_PAGED_CORE_REPLAY_DATA_NOT_ADMISSION';
  readonly view: Readonly<FinanceSocialReplayContinuationView>;
  /** Owned by this read's caller; retire after the surrounding protected
   * source callback. It is immutable DATA, never an SQL/write capability. */
  readonly currentProof: PostwarPagedCurrentProof;
  readonly seedPins: Readonly<{
    worldId: string;
    seedId: string;
    seedFingerprint: string;
    admissionRef: string;
  }>;
  readonly metadata: Readonly<{
    maxCommandSimTimeTicks: string;
    seenCommandTypes: readonly string[];
    prefixFingerprint: string;
    pageChainFingerprint: string;
    captainPredecessorSnapshotHashes: Readonly<Record<string, string>>;
    lastSocialOrigins: Readonly<Record<string, PostwarPagedSocialOrigin>>;
    pendingSocialPlanReceiptFingerprints: Readonly<Record<string, string>>;
    socialMaterializations: Readonly<
      Record<
        string,
        Readonly<
          Partial<
            Record<'POSITION' | 'SERVICE', PostwarPagedSocialMaterialization>
          >
        >
      >
    >;
  }>;
  readonly captainOriginalStatus?: PostwarCaptainOriginalStatus;
}
export interface PostwarPagedSocialMaterialization {
  readonly sourceCommandId: string;
  readonly worldVersion: string;
  readonly afterStateHash: string;
}
export interface PostwarPagedSocialOrigin {
  readonly commandId: string;
  readonly countryId: string;
  readonly commandType: string;
  readonly transitionFingerprint: string;
  readonly receiptFingerprint: string;
  readonly eventFingerprints: readonly string[];
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly events: readonly Readonly<{
    eventId: string;
    fingerprint: string;
    sequence: string;
    worldVersion: string;
  }>[];
}
/** Preserve the existing physical-source check at the actual Core predecessor
 * of every historical PLAN, while its page/checkpoint is still in memory. */
function assertHistoricalPlanPhysicalOriginals(
  document: PostwarSocialEmploymentStateDocument,
  frames: readonly FinanceNativeBudgetCanonicalFrame[],
  result: FinanceNativeBudgetMixedPrefixResult,
): void {
  for (const frame of frames)
    for (const event of frame.events) {
      if (event.eventType !== SOCIAL_SERVICE_PLAN_EVENT) continue;
      const parsed = parseSocialEmploymentServiceCommand(frame.command, sha);
      const checkpoint = result.checkpoints.find(
          (c) => c.eventId === event.eventId,
        ),
        country = document.countries.find(
          (c) => c.countryId === frame.command.countryId,
        );
      if (
        parsed.kind !== 'PLAN' ||
        !checkpoint ||
        !country ||
        checkpoint.countryId !== country.countryId
      )
        invalid('actual historical PLAN predecessor/country required');
      const bodies = country.physicalOriginalBodies.filter(
        (body) =>
          body.locationId === parsed.intent.locationId &&
          body.dayIndex === parsed.intent.dueDayIndex &&
          body.pools.some(
            (pool) =>
              pool.poolId === parsed.intent.servicePoolId &&
              pool.skill === parsed.intent.skill,
          ),
      );
      if (bodies.length !== 1)
        invalid('historical PLAN actual physical original absent/ambiguous');
      const payload = JSON.parse(event.canonicalPayload) as {
        readFacts: SocialEmploymentReadFacts;
      };
      assertSocialPhysicalAttemptEnvelope({
        command: frame.command,
        state: checkpoint.beforeEmployment,
        readFacts: payload.readFacts,
        sourceEnvelope: {
          ...bodies[0]!,
          headWorldVersion: frame.transition.worldVersionBefore,
          headEventSequence: (BigInt(event.sequence) - 1n).toString(),
        },
        sha256Hex: sha,
      });
    }
}
const results = new WeakSet<object>();
export function releasePostwarPagedFinanceSocialReplay(
  result: Readonly<PostwarPagedFinanceSocialReplay>,
): void {
  if (!results.has(result)) invalid('genuine live paged result required');
  retirePostwarPagedCurrentProof(result.currentProof);
  results.delete(result);
}
export async function readPostwarPagedFinanceSocialReplayFrom(
  input: Omit<
    PreparedPostwarFinanceSocialFxReplayRequest,
    'frames' | 'pageBoundary' | 'expectedHead'
  > & {
    readonly expectedHead?: PreparedPostwarFinanceSocialFxReplayRequest['expectedHead'];
  },
): Promise<Readonly<PostwarPagedFinanceSocialReplay>> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
  if (
    b.pins.worldId !== input.worldId ||
    b.pins.seedRef !== input.seedId ||
    b.pins.contentHash !== input.seedFingerprint ||
    b.pins.admissionRef !== input.admissionRef ||
    !b.document.countries.some((c) => c.countryId === input.hostCountryId)
  )
    invalid('exact genuine current prepared source required');
  const opening = readPreparedFinanceSocialOpening(b.prepared);
  if (
    opening.seedId !== input.seedId ||
    opening.seedFingerprint !== input.seedFingerprint ||
    opening.financial.worldId !== input.worldId
  )
    invalid('paired H0 differs from source/admission');
  const reader = createPostwarBoundedPrefixPageReaderFrom(input.executor, {
      worldId: input.worldId,
      countryId: input.hostCountryId,
      officeId: input.officeId,
      seedFingerprint: input.seedFingerprint,
      admissionRef: input.admissionRef,
    }),
    receipts = readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(
      input.baseline,
    );
  let cursor: FinanceSocialReplayContinuation | undefined,
    proof: PostwarPagedCurrentProof | undefined,
    successful = false,
    captainOriginalStatus: PostwarCaptainOriginalStatus | undefined;
  const seenCommandTypes = new Set<string>();
  const captainPredecessorSnapshotHashes: Record<string, string> = {};
  const lastSocialOrigins: Record<string, PostwarPagedSocialOrigin> = {};
  const pendingSocialPlanReceiptFingerprints: Record<string, string> = {};
  const socialMaterializations: Record<
    string,
    Partial<Record<'POSITION' | 'SERVICE', PostwarPagedSocialMaterialization>>
  > = {};
  let maxCommandSimTime = 0n;
  try {
    let page = await reader.readNext();
    if (page === null) invalid('actual H0/first complete page required');
    if (
      input.expectedHead !== undefined &&
      (page.expectedHead.worldVersion !== input.expectedHead.worldVersion ||
        page.expectedHead.eventSequence !== input.expectedHead.eventSequence)
    )
      invalid('actual anchored SQL head differs from caller-held head');
    const expectedHead = page.expectedHead;
    cursor = prepareFinanceSocialReplayContinuation(
      {
        opening,
        expectedHead: page.expectedHead,
        socialCountries: b.document.countries.map((c) => ({
          countryId: c.countryId,
          state: c.state,
          offers: c.offers,
        })),
        openingEncumbrances: projectPostwarOpeningFinancialEncumbrances(
          b.funding,
        ),
        fxOriginals: [],
        ...(receipts === undefined
          ? {}
          : { beneficialHousingRentReceipts: receipts }),
      },
      sha,
    );
    proof = createPostwarPagedCurrentProof(cursor);
    while (page !== null) {
      consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
      const originals =
        await readPreparedPostwarFinanceSocialFxPageOriginalsFrom({
          ...input,
          expectedHead,
          frames: page.frames,
          pageBoundary: {
            fromHead: page.fromHead,
            throughHead: page.throughHead,
          },
        });
      if (originals.captainOriginalStatus !== undefined)
        captainOriginalStatus = originals.captainOriginalStatus;
      // Same-source facts and every full frame reach the same original Core
      // reducers. Selecting source witnesses never removes foreign frames.
      cursor = appendFinanceSocialReplayPage({
        continuation: cursor,
        page,
        sha256Hex: sha,
        originals: {
          fxOriginals: originals.fxOriginals,
          ...(originals.industryWorkSources === undefined
            ? {}
            : { industryWorkSources: originals.industryWorkSources }),
          ...(originals.industryWageSources === undefined
            ? {}
            : { industryWageSources: originals.industryWageSources }),
          ...(originals.omoOriginals === undefined
            ? {}
            : { omoOriginals: originals.omoOriginals }),
          ...(originals.captainCountries === undefined
            ? {}
            : { captainCountries: originals.captainCountries }),
        },
      });
      assertHistoricalPlanPhysicalOriginals(
        b.document,
        page.frames,
        readFinanceSocialReplayContinuation(cursor).result,
      );
      proof = advancePostwarPagedCurrentProof({ proof, continuation: cursor });
      for (const frame of page.frames) {
        seenCommandTypes.add(frame.command.commandType);
        for (const event of frame.events) {
          if (event.eventType === SOCIAL_SERVICE_PLAN_EVENT)
            pendingSocialPlanReceiptFingerprints[frame.command.commandId] =
              canonicalSha256(canonicalHashInput(frame.receipt), sha);
          const kind =
            event.eventType === 'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'
              ? 'POSITION'
              : event.eventType === 'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1' ||
                  event.eventType === 'SOCIAL_JOB_MATCH_SETTLED_V1'
                ? 'SERVICE'
                : null;
          if (kind !== null) {
            const country = frame.command.countryId,
              payload = JSON.parse(event.canonicalPayload) as {
                afterStateHash?: unknown;
              };
            if (
              country === null ||
              typeof payload.afterStateHash !== 'string' ||
              !/^sha256:[a-f0-9]{64}$/u.test(payload.afterStateHash)
            )
              invalid('actual Social state event hash required');
            const values = socialMaterializations[country] ?? {};
            values[kind] = Object.freeze({
              sourceCommandId: frame.command.commandId,
              worldVersion: event.worldVersion,
              afterStateHash: payload.afterStateHash,
            });
            socialMaterializations[country] = values;
          }
        }
        if (frame.command.commandType.startsWith('CORE_SOCIAL_')) {
          const countryId = frame.command.countryId;
          if (countryId === null) invalid('actual Social country required');
          const hash = (value: unknown) =>
            canonicalSha256(canonicalHashInput(value), sha);
          // canonicalHashInput uses the Core canonical serializer, not JSON's
          // insertion order. The source trace retains only one tiny group/country.
          lastSocialOrigins[countryId] = Object.freeze({
            commandId: frame.command.commandId,
            countryId,
            commandType: frame.command.commandType,
            transitionFingerprint: hash(frame.transition),
            receiptFingerprint: hash(frame.receipt),
            eventFingerprints: Object.freeze(
              frame.events.map((e) => e.fingerprint),
            ),
            worldVersionBefore: frame.transition.worldVersionBefore,
            worldVersionAfter: frame.transition.worldVersionAfter,
            events: Object.freeze(
              frame.events.map((e) =>
                Object.freeze({
                  eventId: e.eventId,
                  fingerprint: e.fingerprint,
                  sequence: e.sequence,
                  worldVersion: e.worldVersion,
                }),
              ),
            ),
          });
        }
        if (frame.command.simTime.ticks > maxCommandSimTime)
          maxCommandSimTime = frame.command.simTime.ticks;
        if (
          frame.command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'
        ) {
          const event = frame.events[0];
          if (
            !event ||
            frame.events.length !== 1 ||
            frame.command.countryId === null
          )
            invalid('exact verified Captain event required');
          const value = JSON.parse(event.canonicalPayload) as {
            source?: { trace?: { snapshot?: { snapshotHash?: unknown } } };
          };
          const fingerprint = value.source?.trace?.snapshot?.snapshotHash;
          if (
            typeof fingerprint !== 'string' ||
            !/^(?:sha256:)?[a-f0-9]{64}$/u.test(fingerprint)
          )
            invalid('verified Captain snapshot trace required');
          captainPredecessorSnapshotHashes[frame.command.countryId] =
            fingerprint;
        }
      }
      // Only live pending claims need an exact PLAN receipt for a fresh MATCH.
      // Settled historical receipts remain in the verified page chains, not an
      // unbounded second collection of receipt bodies/fingerprints.
      const pendingPlans = new Set(
        readFinanceSocialReplayContinuation(
          cursor,
        ).result.socialCountries.flatMap((c) =>
          c.lifecycle.employment.plans
            .filter((p) => p.state === 'PENDING')
            .map((p) => p.planCommandId),
        ),
      );
      for (const planId of Object.keys(pendingSocialPlanReceiptFingerprints))
        if (!pendingPlans.has(planId))
          delete pendingSocialPlanReceiptFingerprints[planId];
      consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
      page = await reader.readNext();
    }
    const view = readFinanceSocialReplayContinuation(cursor);
    if (
      !view.complete ||
      !reader.inspect().complete ||
      view.head.worldVersion !== expectedHead.worldVersion ||
      view.head.eventSequence !== expectedHead.eventSequence
    )
      invalid('complete Core prefix through actual locked head required');
    const checked = readPostwarPagedCurrentProof(proof);
    if (
      checked.coverage.prefixFingerprint !== view.chainFingerprint ||
      checked.coverage.pageProof.frameCount !== view.frameCount ||
      checked.coverage.pageProof.pageCount !== view.pageCount
    )
      invalid('exact genuine Core coverage required');
    consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
    successful = true;
    const result: Readonly<PostwarPagedFinanceSocialReplay> = Object.freeze({
      classification: 'COMPLETE_PAGED_CORE_REPLAY_DATA_NOT_ADMISSION',
      view,
      currentProof: proof,
      seedPins: Object.freeze({
        worldId: input.worldId,
        seedId: input.seedId,
        seedFingerprint: input.seedFingerprint,
        admissionRef: input.admissionRef,
      }),
      metadata: Object.freeze({
        maxCommandSimTimeTicks: maxCommandSimTime.toString(),
        seenCommandTypes: Object.freeze([...seenCommandTypes].sort()),
        prefixFingerprint: view.chainFingerprint,
        pageChainFingerprint: view.chainFingerprint,
        captainPredecessorSnapshotHashes: Object.freeze(
          captainPredecessorSnapshotHashes,
        ),
        lastSocialOrigins: Object.freeze(lastSocialOrigins),
        pendingSocialPlanReceiptFingerprints: Object.freeze(
          pendingSocialPlanReceiptFingerprints,
        ),
        socialMaterializations: Object.freeze(
          Object.fromEntries(
            Object.entries(socialMaterializations).map(([country, value]) => [
              country,
              Object.freeze(value),
            ]),
          ),
        ),
      }),
      ...(captainOriginalStatus === undefined ? {} : { captainOriginalStatus }),
    });
    results.add(result);
    return result;
  } finally {
    if (cursor !== undefined) retireFinanceSocialReplayContinuation(cursor);
    if (!successful && proof !== undefined)
      retirePostwarPagedCurrentProof(proof);
  }
}

/** Fixed shared-host bridge. Own actor/lease/H/domain locks come first; call
 * at the private connection's worker role after any own reader scope unwinds.
 * Existing SocialPositionRuntimeDatabase issues RR immediately after BEGIN,
 * before lease/head reads. This helper never late-SETs RR; the page RPC rejects
 * generic RC. Shared composition enables the versioned source fence before
 * opening this transaction: parent SHARE alone cannot refresh an older RR
 * snapshot after a concurrently appended revocation. */
export async function readPagedFromPreparedSocialBaseOnHeldExecutor(
  tx: SqlExecutor,
  input: {
    readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
    readonly worldId: string;
    readonly hostCountryId: string;
    readonly expectedHead?: PreparedPostwarFinanceSocialFxReplayRequest['expectedHead'];
    readonly captainCountryId?: string;
    readonly requireCaptain?: boolean;
    readonly omoOriginalMode?: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
  },
): Promise<Readonly<PostwarPagedFinanceSocialReplay>> {
  const social = input.socialConnection;
  if (!isPostwarSocialRuntimeConnection(social, input.worldId))
    invalid('genuine same-World Social connection required');
  const resources = readPostwarSocialRuntimeConnectionResources(social),
    baseline = readPostwarSocialRuntimeFinancialReplayBase(
      social,
      input.worldId,
    ),
    b = consumePreparedPostwarSocialFinancialReplayBase(baseline);
  if (!resources.countryIds.includes(input.hostCountryId))
    invalid('actual prepared country required');
  const scope = createPostwarSocialSourceRoleScope({
    workerRole: resources.workerRole,
  });
  const prior = await tx.query<{
    fx_world: string | null;
    captain_world: string | null;
    social_world: string | null;
  }>(
    "select current_setting('econmind.fx_history_world',true)as fx_world,current_setting('econmind.captain_world',true)as captain_world,current_setting('econmind.social_custody_world',true)as social_world",
  );
  if (prior.rows.length !== 1 || !prior.rows[0])
    invalid('exact actual GUC snapshot required');
  const saved = prior.rows[0];
  let outcome:
    | { ok: true; value: Readonly<PostwarPagedFinanceSocialReplay> }
    | { ok: false; error: unknown };
  try {
    const value = await scope.withSourceReaderFrom(tx, () =>
      readPostwarPagedFinanceSocialReplayFrom({
        executor: tx,
        baseline,
        worldId: input.worldId,
        hostCountryId: input.hostCountryId,
        officeId: 'SOCIAL',
        seedId: b.pins.seedRef,
        seedFingerprint: b.pins.contentHash,
        admissionRef: b.pins.admissionRef,
        ...(input.expectedHead === undefined
          ? {}
          : { expectedHead: input.expectedHead }),
        ...(input.captainCountryId === undefined
          ? {}
          : { captainCountryId: input.captainCountryId }),
        ...(input.requireCaptain === undefined
          ? {}
          : { requireCaptain: input.requireCaptain }),
        ...(input.omoOriginalMode === undefined
          ? {}
          : { omoOriginalMode: input.omoOriginalMode }),
      }),
    );
    outcome = { ok: true, value };
  } catch (error) {
    outcome = { ok: false, error };
  }
  try {
    // An unset custom GUC normalizes to the empty, non-World value; existing
    // world-equality RLS predicates reject both null and empty settings.
    await tx.query(
      "select set_config('econmind.fx_history_world',$1,true),set_config('econmind.captain_world',$2,true),set_config('econmind.social_custody_world',$3,true)",
      [
        saved.fx_world ?? '',
        saved.captain_world ?? '',
        saved.social_world ?? '',
      ],
    );
  } catch (restore) {
    if (outcome.ok) releasePostwarPagedFinanceSocialReplay(outcome.value);
    else
      throw new AggregateError(
        [outcome.error, restore],
        'paged source scope restoration failed; transaction must rollback',
        { cause: restore },
      );
    throw restore;
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
