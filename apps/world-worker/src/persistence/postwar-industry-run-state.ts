/** Same held executor, fixed source locks and complete paged Core replay.
 * Context is immutable DATA; no actor/lease/approval crosses this boundary. */
import {
  createIndustryFirstDayWorkState,
  extendIndustryFirstDayWorkSources,
  readIndustryFirstDayWorkState,
  type IndustryFirstDayWorkState,
  type IndustryFirstDayWorkSiteSource,
  type IndustryCompletedWork,
} from '@econmind/core/industry-first-day-work';
import type {
  FinancialLedgerState,
  InventoryLedgerState,
} from '@econmind/core';
import type { IndustryOperatingWageState } from '@econmind/core/industry-operating-wage-payment';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
import { type PostwarIndustryFirstDaySourceData } from './postwar-industry-first-day-source.js';
import {
  projectPostwarIndustryRunSiteSource,
  readPostwarIndustryRunSourceFrom,
} from './postwar-industry-run-originals.js';
import {
  readPagedFromPreparedSocialBaseOnHeldExecutor,
  releasePostwarPagedFinanceSocialReplay,
  type PostwarPagedFinanceSocialReplay,
} from './postwar-paged-finance-social-replay.js';
import type { SqlExecutor } from './sql-database.js';

declare const contextBrand: unique symbol;
export interface PostwarIndustryRunStateContext {
  readonly [contextBrand]: true;
}
export interface PostwarIndustryRunStateFacts {
  readonly classification: 'CURRENT_INDUSTRY_RUN_WORK_DATA_NOT_AUTHORITY';
  readonly head: Readonly<{
    worldId: string;
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly seedPins: PostwarPagedFinanceSocialReplay['seedPins'];
  readonly financial: Readonly<FinancialLedgerState>;
  readonly inventory: Readonly<InventoryLedgerState>;
  readonly workState: IndustryFirstDayWorkState;
  readonly wageState: Readonly<IndustryOperatingWageState> | undefined;
  readonly completedWorks: readonly IndustryCompletedWork[];
  readonly siteSources: readonly Readonly<IndustryFirstDayWorkSiteSource>[];
  readonly firstdayOriginal: Readonly<PostwarIndustryFirstDaySourceData>;
  readonly baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
  readonly maxCommandSimTimeTicks: string;
  readonly pagedReplay: PostwarPagedFinanceSocialReplay['view'];
  readonly prefixFingerprint: string;
  readonly pageChainFingerprint: string;
  /** Current filled positions are eligibility DATA, not completed work. */
  readonly currentEmployment: readonly Readonly<{
    positionId: string;
    employedCount: string;
  }>[];
  readonly socialCountries: PostwarPagedFinanceSocialReplay['view']['result']['socialCountries'];
  readonly budgetEncumbrances: PostwarPagedFinanceSocialReplay['view']['result']['budgetEncumbrances'];
  readonly socialReservations: PostwarPagedFinanceSocialReplay['view']['result']['socialReservations'];
}
const contexts = new WeakMap<
  object,
  {
    tx: SqlExecutor;
    facts: Readonly<PostwarIndustryRunStateFacts>;
    paged: Readonly<PostwarPagedFinanceSocialReplay>;
  }
>();
function fail(reason: string): never {
  throw Error('POSTWAR_INDUSTRY_RUN_STATE:' + reason);
}
export function consumePostwarIndustryRunStateFrom(
  tx: SqlExecutor,
  context: Readonly<PostwarIndustryRunStateContext>,
): Readonly<PostwarIndustryRunStateFacts> {
  const held = contexts.get(context);
  if (!held || held.tx !== tx) fail('LIVE_SAME_EXECUTOR_CONTEXT_REQUIRED');
  consumePreparedPostwarSocialFinancialReplayBase(held.facts.baseline);
  return held.facts;
}
export function releasePostwarIndustryRunStateContext(
  context: Readonly<PostwarIndustryRunStateContext>,
): void {
  const held = contexts.get(context);
  if (!held) fail('LIVE_GENUINE_CONTEXT_REQUIRED');
  contexts.delete(context);
  releasePostwarPagedFinanceSocialReplay(held.paged);
}
export async function readPostwarIndustryRunStateFrom(
  tx: SqlExecutor,
  input: Readonly<{
    socialConnection: Readonly<PostwarSocialRuntimeConnection>;
    worldId: string;
    countryId: string;
    facilityId: string;
    readonly pendingWaterDeliveryCommand?: import('@econmind/core').CanonicalCommand;
    /** Caller holds actual H/lease before entry. Exact actual SQL H is rechecked. */
    expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
  }>,
): Promise<Readonly<PostwarIndustryRunStateContext>> {
  if (!isPostwarSocialRuntimeConnection(input.socialConnection, input.worldId))
    fail('GENUINE_SAME_WORLD_SOCIAL_SOURCE_REQUIRED');
  const resources = readPostwarSocialRuntimeConnectionResources(
      input.socialConnection,
    ),
    baseline = readPostwarSocialRuntimeFinancialReplayBase(
      input.socialConnection,
      input.worldId,
    ),
    b = consumePreparedPostwarSocialFinancialReplayBase(baseline);
  if (
    !resources.countryIds.includes(input.countryId) ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(resources.workerRole)
  )
    fail('ACTUAL_PREPARED_COUNTRY_AND_WORKER_REQUIRED');
  const before = await tx.query<{ role_name: string }>(
    'select current_user as role_name',
  );
  if (
    before.rows.length !== 1 ||
    before.rows[0]?.role_name !== resources.workerRole
  )
    fail('ACTUAL_WORKER_EXECUTOR_BEFORE_SOURCE_SCOPE_REQUIRED');
  let original: Readonly<PostwarIndustryFirstDaySourceData> | null = null;
  let failure: unknown;
  try {
    await tx.query('set local role world_v2_industry_source_reader');
    original = await readPostwarIndustryRunSourceFrom(tx, {
      baseline,
      worldId: input.worldId,
      countryId: input.countryId,
      facilityId: input.facilityId,
      head: input.expectedHead,
      expectedPins: {
        seedId: b.pins.seedRef,
        seedFingerprint: b.pins.contentHash,
        admissionRef: b.pins.admissionRef,
      },
    });
  } catch (error) {
    failure = error;
  }
  try {
    await tx.query('set local role "' + resources.workerRole + '"');
  } catch (restore) {
    if (failure !== undefined)
      throw new AggregateError(
        [failure, restore],
        'Industry source role restore failed',
        { cause: restore },
      );
    throw restore;
  }
  if (failure !== undefined) throw failure;
  if (!original) fail('ADOPTED_FIRST_DAY_SITE_ORIGINAL_MISSING');
  const site = projectPostwarIndustryRunSiteSource(original, baseline);
  let paged: Readonly<PostwarPagedFinanceSocialReplay> | undefined,
    successful = false;
  try {
    paged = await readPagedFromPreparedSocialBaseOnHeldExecutor(tx, {
      socialConnection: input.socialConnection,
      worldId: input.worldId,
      hostCountryId: input.countryId,
      expectedHead: input.expectedHead,
      ...(input.pendingWaterDeliveryCommand === undefined
        ? {}
        : { pendingWaterDeliveryCommand: input.pendingWaterDeliveryCommand }),
    });
    const result = paged.view.result;
    if (!result.financialState || !result.inventoryState)
      fail('GENUINE_CURRENT_PAIRED_LEDGERS_REQUIRED');
    const workState =
      result.industryWorkState === undefined
        ? createIndustryFirstDayWorkState([site])
        : extendIndustryFirstDayWorkSources(result.industryWorkState, [site]);
    const selected = result.socialCountries.filter(
      (c) => c.countryId === input.countryId,
    );
    if (selected.length !== 1) fail('EXACT_ACTUAL_CURRENT_COUNTRY_REQUIRED');
    const currentEmployment = site.positions.map((p) => {
      const matches = selected[0]!.lifecycle.employment.labour.positions.filter(
        (c) => c.positionId === p.positionId,
      );
      if (
        matches.length !== 1 ||
        matches[0]!.locationId !== site.locationId ||
        matches[0]!.skill !== p.skill ||
        BigInt(matches[0]!.employedCount) > BigInt(p.count)
      )
        fail('CURRENT_SITE_EMPLOYMENT_AND_ORIGINAL_RANGE_DIFFER');
      return Object.freeze({
        positionId: p.positionId,
        employedCount: matches[0]!.employedCount,
      });
    });
    const facts: Readonly<PostwarIndustryRunStateFacts> = Object.freeze({
      classification: 'CURRENT_INDUSTRY_RUN_WORK_DATA_NOT_AUTHORITY',
      head: Object.freeze({ worldId: input.worldId, ...paged.view.head }),
      seedPins: paged.seedPins,
      financial: result.financialState,
      inventory: result.inventoryState,
      workState,
      wageState: result.industryWageState,
      completedWorks: readIndustryFirstDayWorkState(workState).completedWorks,
      siteSources: Object.freeze([site]),
      firstdayOriginal: original,
      baseline,
      maxCommandSimTimeTicks: paged.metadata.maxCommandSimTimeTicks,
      pagedReplay: paged.view,
      prefixFingerprint: paged.metadata.prefixFingerprint,
      pageChainFingerprint: paged.metadata.pageChainFingerprint,
      currentEmployment: Object.freeze(currentEmployment),
      socialCountries: result.socialCountries,
      budgetEncumbrances: result.budgetEncumbrances,
      socialReservations: result.socialReservations,
    });
    const token = Object.freeze({}) as PostwarIndustryRunStateContext;
    contexts.set(token, { tx, facts, paged });
    successful = true;
    return token;
  } finally {
    if (!successful && paged) releasePostwarPagedFinanceSocialReplay(paged);
  }
}
