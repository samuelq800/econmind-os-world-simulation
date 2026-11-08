/** Fixed internal logistics, from admitted source and the actual full prefix. Actual resource effects are
 * rederived on the same held executor; a source packet is never a ready flag. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalSha256,
  canonicalHashInput,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  parseWorldWriterLease,
  createWorldWriterCommitAssertion,
  createInventoryPosting,
  isValidatedOpeningSeed,
  Money,
  type InventoryPosting,
  type CanonicalCommand,
  type CommitAuthorizationProof,
} from '@econmind/core';
import {
  parseIndustryUtilityPlanningRow,
  type IndustryUtilityPlanningRow,
} from '@econmind/core/postwar-industry-utility-planning-contract';
import { readIndustryInternalLogisticsPlan } from '@econmind/core/industry-internal-logistics';
import {
  parseIndustryUtilityManualIntent,
  prepareIndustryUtilityExecution,
} from '@econmind/core/industry-utility-execution';
import {
  createIndustryInternalLogisticsExecutionState,
  prepareIndustryInternalLogisticsFrame,
  readIndustryInternalLogisticsExecutionState,
  readIndustryInternalLogisticsReplaySources,
} from '@econmind/core/industry-internal-logistics-execution';
import { readIndustryFirstDayWorkState } from '@econmind/core/industry-first-day-work';
import { decodeDurableFinancialPostingBatch } from './durable-v08-ledger-lineage-reader.js';
import { loadPostwarSourceContext } from '../preparation/postwar-source-context.js';
import type { PostwarPhysicalSourceContext } from '../preparation/postwar-physical-service-receipt.js';
import { readPostwarSocialRuntimeFinancialReplayBase } from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import {
  loadPostwarIndustryLogisticsPolicy,
  bindPostwarIndustryLogisticsSourceConfiguration,
  projectPostwarIndustryLogisticsReplaySources,
  retirePostwarIndustryLogisticsSourceConfiguration,
  readPostwarIndustryLogisticsReplaySourcesFrom,
  PostwarIndustryLogisticsSourceMissing,
  type PostwarIndustryLogisticsPolicyBytes,
} from './postwar-industry-logistics-source.js';
import type { PostwarIndustryUtilitySourceInput } from './postwar-industry-utility-source.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';
import { requirePostwarSocialSourceRevocationFence } from './postwar-social-position-runtime.js';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  INDUSTRY_RUN_SCOPE_QUERY,
  type IndustryRunSourceCommitRequest,
} from './postwar-industry-run-runtime.js';
import {
  readPostwarIndustryRunStateFrom,
  consumePostwarIndustryRunStateFrom,
  releasePostwarIndustryRunStateContext,
  type PostwarIndustryRunStateContext,
} from './postwar-industry-run-state.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
  PreparedCurrentMaterialization,
} from './atomic-transition-repository.js';
export { PostwarIndustryLogisticsSourceMissing } from './postwar-industry-logistics-source.js';
export type PostwarIndustryLogisticsPreparation = Omit<
  PostwarIndustryUtilitySourceInput,
  'socialConnection'
>;
export const INDUSTRY_LOGISTICS_SOURCE_PURPOSE =
  'POSTWAR_INDUSTRY_LOGISTICS_SOURCE_RECHECK_V1' as const;
export type IndustryLogisticsSourceCommitRequest = Omit<
  IndustryRunSourceCommitRequest,
  'purpose'
> & {
  readonly purpose: typeof INDUSTRY_LOGISTICS_SOURCE_PURPOSE;
  readonly currentMaterializations: readonly PreparedCurrentMaterialization[];
};
export interface IndustryLogisticsSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<IndustryLogisticsSourceCommitRequest>,
  ): Promise<
    Readonly<{
      status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
      purpose: typeof INDUSTRY_LOGISTICS_SOURCE_PURPOSE;
      commandFingerprint: string;
      currentHead: IndustryLogisticsSourceCommitRequest['currentHead'];
      readBindingFingerprint: string;
      protectionMode: 'HELD_SOURCE_GUARDS';
    }>
  >;
}
export interface PostwarIndustryLogisticsRuntime {
  readonly worldId: string;
  readonly database: SqlDatabase;
  readonly candidateFactory: Readonly<AtomicTransitionCandidateFactory>;
  readonly sourceCommitProtectionPort: Readonly<IndustryLogisticsSourceCommitProtectionPort>;
  prepare(source: Readonly<PostwarIndustryLogisticsPreparation>): Promise<void>;
  assertSourceBeforeClaim(
    command: CanonicalCommand,
    observedAtReal: string,
  ): Promise<void>;
  readPlanningScope(countryId: string): Readonly<{
    worldId: string;
    countryId: string;
    facilityId: string;
  }> | null;
  readPlanningFrom(
    tx: SqlExecutor,
    input: Readonly<{
      countryId: string;
      expectedHead: Readonly<
        Pick<
          IndustryLogisticsSourceCommitRequest['currentHead'],
          'worldVersion' | 'eventSequence'
        >
      >;
      context: Readonly<PostwarIndustryRunStateContext>;
    }>,
  ): Promise<
    Readonly<{
      head: IndustryLogisticsSourceCommitRequest['currentHead'];
      rows: readonly IndustryUtilityPlanningRow[];
      prefixFingerprint: string;
      pageChainFingerprint: string;
      sourceOriginalsFingerprint: string;
    }>
  >;
  close(): Promise<void>;
}
const runtimes = new WeakMap<
    object,
    { live: () => boolean; ready: () => boolean }
  >(),
  guards = new WeakMap<object, () => boolean>();
export function isPostwarIndustryLogisticsRuntime(
  v: unknown,
): v is Readonly<PostwarIndustryLogisticsRuntime> {
  return !!v && typeof v === 'object' && runtimes.get(v)?.live() === true;
}
export function isPreparedPostwarIndustryLogisticsRuntime(
  v: unknown,
): v is Readonly<PostwarIndustryLogisticsRuntime> {
  return !!v && typeof v === 'object' && runtimes.get(v)?.ready() === true;
}
export function isPostwarIndustryLogisticsSourceCommitProtectionPort(
  v: unknown,
): v is Readonly<IndustryLogisticsSourceCommitProtectionPort> {
  return !!v && typeof v === 'object' && guards.get(v)?.() === true;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex'),
  hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha),
  same = (a: unknown, b: unknown) =>
    canonicalSerialize(a) === canonicalSerialize(b);
function fail(s: string): never {
  throw Error('INDUSTRY_LOGISTICS:' + s);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v) fail('ACTUAL_SCOPE_FIELD_REQUIRED');
  return v;
}
export function createPostwarIndustryLogisticsRuntime(config: {
  readonly database: SqlDatabase;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly sourceContext?: PostwarPhysicalSourceContext;
  readonly clock: DurableConsumptionClock;
}): Readonly<PostwarIndustryLogisticsRuntime> {
  const social = config.socialConnection;
  if (!isPostwarSocialRuntimeConnection(social, social?.worldId))
    fail('GENUINE_SOCIAL_CONNECTION_REQUIRED');
  const world = social.worldId,
    worker = social.workerId,
    { workerRole } = readPostwarSocialRuntimeConnectionResources(social);
  requirePostwarSocialSourceRevocationFence(social.database, world);
  let closed = false,
    source:
      | Readonly<{
          context: PostwarPhysicalSourceContext;
          policyBytes: PostwarIndustryLogisticsPolicyBytes;
        }>
      | undefined;
  let preparing: Promise<void> | undefined;
  let preparedBase:
    ReturnType<typeof readPostwarSocialRuntimeFinancialReplayBase> | undefined;
  const pending = new Set<Promise<unknown>>(),
    active = new WeakSet<object>(),
    live = () => !closed && isPostwarSocialRuntimeConnection(social, world),
    ready = () => {
      if (!live() || !source) return false;
      try {
        readPostwarSocialRuntimeFinancialReplayBase(social, world);
        return true;
      } catch {
        return false;
      }
    };
  function track<T>(run: () => Promise<T>): Promise<T> {
    if (!live()) return Promise.reject(Error('INDUSTRY_LOGISTICS_RETIRED'));
    const p = Promise.resolve().then(run);
    pending.add(p);
    void p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
    return p;
  }
  async function authorized(
    c: CanonicalCommand,
    proof: CommitAuthorizationProof | null,
  ) {
    if (
      !isCommitAuthorizationProof(proof) ||
      proof.commandId !== c.commandId ||
      proof.commandFingerprint !== c.fingerprint ||
      proof.worldId !== world ||
      proof.countryId !== c.countryId ||
      proof.officeId !== 'INDUSTRY' ||
      proof.capability !== 'INDUSTRY_PRODUCTION' ||
      proof.authSubject !== c.authSubject ||
      proof.actorId !== c.actorId
    )
      fail('GENUINE_CURRENT_INDUSTRY_PROOF_REQUIRED');
    await reauthorizeCommitAuthorizationProof(proof);
  }
  async function derive(tx: SqlExecutor, c: CanonicalCommand, at: string) {
    if (!ready() || !source)
      throw new PostwarIndustryLogisticsSourceMissing('SOURCE_NOT_PREPARED');
    const intent = parseIndustryUtilityManualIntent(c, sha);
    if (
      c.worldId !== world ||
      c.expectedWorldVersion === null ||
      c.idempotencyKey === null ||
      intent.serviceKind !== 'LOGISTICS' ||
      new Date(at).toISOString() !== at
    )
      fail('EXACT_MANUAL_ADOPTED_UTILITY_SCOPE_REQUIRED');
    const role = await tx.query<{ role_name: string }>(
      'select current_user as role_name',
    );
    if (role.rows.length !== 1 || role.rows[0]?.role_name !== workerRole)
      fail('ACTUAL_WORKER_EXECUTOR_REQUIRED');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      c.authSubject,
    ]);
    let rows: readonly Record<string, unknown>[] = [],
      failure: unknown;
    try {
      await tx.query('set local role world_v2_industry_source_reader');
      rows = (
        await tx.query<Record<string, unknown>>(INDUSTRY_RUN_SCOPE_QUERY, [
          world,
          c.countryId,
          c.authSubject,
          worker,
          c.expectedWorldVersion,
          at,
        ])
      ).rows;
      if (rows.length !== 1) fail('ACTUAL_LEASE_HEAD_ACTOR_SEAT_REQUIRED');
    } catch (e) {
      failure = e;
    }
    try {
      await tx.query('set local role "' + workerRole + '"');
    } catch (restore) {
      if (failure !== undefined)
        throw new AggregateError(
          [failure, restore],
          'Utility source scope restore failed',
          { cause: restore },
        );
      throw restore;
    }
    if (failure !== undefined) throw failure;
    const r = rows[0]!,
      head = {
        worldId: world,
        worldVersion: text(r.world_version),
        eventSequence: text(r.event_sequence),
      },
      ctx = await readPostwarIndustryRunStateFrom(tx, {
        socialConnection: social,
        worldId: world,
        countryId: c.countryId,
        facilityId: intent.facilityId,
        expectedHead: head,
      });
    try {
      const facts = consumePostwarIndustryRunStateFrom(tx, ctx);
      if (c.simTime.ticks < BigInt(facts.maxCommandSimTimeTicks))
        fail('COMMAND_TIME_PRECEDES_ACTUAL_HISTORY');
      const runs = readIndustryFirstDayWorkState(facts.workState).runs.filter(
        (r) =>
          r.source.countryId === c.countryId &&
          r.source.facilityId === intent.facilityId,
      );
      if (!runs.some((r) => r.terms.runId === intent.runId))
        fail('ACTUAL_COMMITTED_TARGET_RUN_REQUIRED');
      let projected:
        | Awaited<
            ReturnType<typeof readPostwarIndustryLogisticsReplaySourcesFrom>
          >
        | undefined;
      let sourceFailure: unknown;
      try {
        await tx.query('set local role world_v2_industry_source_reader');
        projected = await readPostwarIndustryLogisticsReplaySourcesFrom(tx, {
          baseline: facts.baseline,
          worldId: world,
          countryId: c.countryId,
          facilityId: intent.facilityId,
          runIds: runs.map((r) => r.terms.runId),
          expectedHead: head,
        });
      } catch (e) {
        sourceFailure = e;
      }
      try {
        await tx.query('set local role "' + workerRole + '"');
      } catch (restore) {
        if (sourceFailure !== undefined)
          throw new AggregateError(
            [sourceFailure, restore],
            'Logistics order scope restore failed',
            { cause: restore },
          );
        throw restore;
      }
      if (sourceFailure !== undefined) throw sourceFailure;
      if (!projected) fail('ACTUAL_LOGISTICS_SOURCE_REQUIRED');
      const utilitySource = projected.utilitySources.find(
        (r) => r.runId === intent.runId,
      );
      if (!utilitySource) fail('ACTUAL_LOGISTICS_RUN_SOURCE_REQUIRED');
      const preparation = prepareIndustryUtilityExecution(
        { command: c, replay: facts.pagedReplay, source: utilitySource },
        sha,
      );
      const prior =
        facts.pagedReplay.result.industryLogisticsState?.filter(
          (s) =>
            readIndustryInternalLogisticsExecutionState(s).source.countryId ===
              c.countryId &&
            readIndustryInternalLogisticsExecutionState(s).source.facilityId ===
              intent.facilityId,
        ) ?? [];
      if (prior.length > 1) fail('UNIQUE_PRIOR_LOGISTICS_STATE_REQUIRED');
      if (intent.operation.action === 'SERVICE_WORK') {
        const originals = readIndustryInternalLogisticsReplaySources(
            projected.source,
          ),
          original = originals.workOriginals.find(
            (o) =>
              o.reference === intent.operation.workOrderRef &&
              o.rawSha256 === intent.operation.workOrderSha256,
          );
        if (!original)
          throw new PostwarIndustryLogisticsSourceMissing(
            'REGISTERED_WORK_ORDER_MISSING',
          );
        const body = JSON.parse(original.rawText) as Record<string, unknown>;
        if (!Array.isArray(body.allocations))
          fail('CONTROLLED_ACTUAL_WORK_ALLOCATIONS_REQUIRED');
        const countries = facts.socialCountries.filter(
          (r) => r.countryId === c.countryId,
        );
        if (countries.length !== 1)
          fail('ACTUAL_CURRENT_SOCIAL_COUNTRY_REQUIRED');
        for (const raw of body.allocations) {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            fail('ACTUAL_ALLOCATION_RECORD_REQUIRED');
          const a = raw as Record<string, unknown>,
            matches =
              countries[0]!.lifecycle.employment.labour.positions.filter(
                (p) => p.positionId === a.positionId,
              );
          if (
            matches.length !== 1 ||
            matches[0]!.locationId !== a.regionId ||
            matches[0]!.skill !== a.skill ||
            !/^[1-9][0-9]*$/.test(text(a.count)) ||
            BigInt(matches[0]!.employedCount) < BigInt(text(a.count))
          )
            fail('ACTUAL_CURRENT_LOGISTICS_EMPLOYMENT_REQUIRED');
        }
      }
      if (intent.operation.action === 'PAY_INPUTS') {
        const originals = readIndustryInternalLogisticsReplaySources(
            projected.source,
          ),
          original = originals.expenseOriginals.find(
            (o) =>
              o.reference === intent.operation.expenseOrderRef &&
              o.rawSha256 === intent.operation.expenseOrderSha256,
          );
        if (!original)
          throw new PostwarIndustryLogisticsSourceMissing(
            'REGISTERED_EXPENSE_ORDER_MISSING',
          );
        const order = JSON.parse(original.rawText) as Record<string, unknown>;
        const amount = Money.from(text(order.amount), text(order.currency));
        if (!amount.amount.isPositive())
          fail('POSITIVE_ACTUAL_PAYMENT_REQUIRED');
        const base = consumePreparedPostwarSocialFinancialReplayBase(
          facts.baseline,
        );
        const funding = base.document.inputs.fundingAccounts.filter(
          (a) =>
            a.countryId === c.countryId &&
            a.payerEntityId === originals.operatorId &&
            a.payerRole === 'OP',
        );
        if (funding.length !== 1 || funding[0]!.currency !== amount.currency)
          fail('EXACT_CURRENT_OPERATOR_FUNDING_REQUIRED');
        const account = funding[0]!,
          positions = facts.financial.positions.filter(
            (p) =>
              p.account.accountId === account.accountRef &&
              p.account.ownerId === originals.operatorId &&
              p.account.currency === amount.currency,
          );
        if (positions.length !== 1)
          fail('ACTUAL_CURRENT_OPERATOR_DEPOSIT_REQUIRED');
        const aggregateOpening = base.funding.filter(
          (f) => f.accountId === account.accountRef,
        );
        if (
          aggregateOpening.length !== 1 ||
          aggregateOpening[0]!.fundingId !== account.accountRef ||
          !Money.from(
            aggregateOpening[0]!.ceilingAmount,
            amount.currency,
          ).amount.equals(
            Money.from(account.reservedAmount, amount.currency).amount,
          )
        )
          fail('EXACT_AGGREGATE_ORIGINAL_OPENING_RESERVATION_REQUIRED');
        let retained = Money.from('0', amount.currency);
        for (const original of base.funding.filter(
          (f) => f.accountId === account.accountRef,
        )) {
          if (
            original.currency !== amount.currency ||
            original.payerEntityId !== originals.operatorId ||
            original.countryId !== c.countryId
          )
            fail('EXACT_OPENING_RESERVATION_REQUIRED');
          let remaining = Money.from(original.ceilingAmount, original.currency);
          for (const paid of facts.wageState?.reservationReleases ?? []) {
            if (paid.openingEncumbranceRef !== original.fundingId) continue;
            if (
              paid.accountId !== account.accountRef ||
              paid.currency !== amount.currency
            )
              fail('EXACT_ACTUAL_PAID_RELEASE_REQUIRED');
            remaining = remaining.subtract(
              Money.from(paid.amount, paid.currency),
            );
          }
          // These payments were independently rederived by the private full
          // prefix fold and are present in the actual authoritative ledger.
          for (const state of facts.pagedReplay.result.industryLogisticsState ??
            []) {
            const view = readIndustryInternalLogisticsExecutionState(state);
            if (
              view.source.operatorId !== originals.operatorId ||
              view.source.countryId !== c.countryId
            )
              continue;
            for (const transfer of view.transfers)
              for (const paid of transfer.payments) {
                if (
                  paid.currency !== amount.currency ||
                  paid.batch.legs[1]?.account.accountId !==
                    account.accountRef ||
                  !facts.financial.appliedBatches.some(
                    (b) =>
                      b.batchId === paid.batch.batchId &&
                      b.fingerprint === paid.batch.fingerprint,
                  )
                )
                  fail('EXACT_REPLAYED_LOGISTICS_PAY_RELEASE_REQUIRED');
                remaining = remaining.subtract(
                  Money.from(paid.amount, paid.currency),
                );
              }
          }
          remaining = remaining.subtract(amount);
          if (remaining.amount.isPositive()) retained = retained.add(remaining);
        }
        for (const r of facts.budgetEncumbrances)
          if (r.accountId === account.accountRef) {
            if (r.currency !== amount.currency)
              fail('RESERVATION_CURRENCY_CHANGED');
            retained = retained.add(Money.from(r.amount, r.currency));
          }
        for (const r of facts.socialReservations)
          if (r.accountId === account.accountRef) {
            if (r.currency !== amount.currency)
              fail('RESERVATION_CURRENCY_CHANGED');
            retained = retained.add(Money.from(r.amount, r.currency));
          }
        if (
          positions[0]!.netDebitBalance
            .subtract(amount)
            .amount.lessThan(retained.amount)
        )
          fail('LOGISTICS_PAYMENT_INVADES_RETAINED_OBLIGATIONS');
      }
      const state = createIndustryInternalLogisticsExecutionState(
        {
          preparation,
          sourceInputs: projected.source,
          ...(prior[0] ? { state: prior[0] } : {}),
        },
        sha,
      );
      const draft = prepareIndustryInternalLogisticsFrame(
        { state, command: c, observedAtReal: at },
        sha,
      );
      if (draft.outcome === 'EXACT_DUPLICATE')
        fail('FINAL_RECOVERY_PRECEDES_FRESH_CANDIDATE');
      // These are already genuine Core-produced postings. Reconstructing them
      // checks the public journal contract before handing them to Atomic.
      const inventoryPostings = draft.frame.inventoryPostings.map((value) => {
        const posting = value as InventoryPosting;
        const rebuilt = createInventoryPosting(
          { ...posting, command: c, transition: draft.frame.transition },
          sha,
        );
        if (!same(rebuilt, value))
          fail('CORE_INVENTORY_JOURNAL_RECONSTRUCTION_DIFFERS');
        return rebuilt;
      });
      const financialPostingBatches = draft.frame.financialPostingBatches.map(
        (value) => {
          const canonical = JSON.parse(canonicalSerialize(value)) as Record<
            string,
            unknown
          >;
          return decodeDurableFinancialPostingBatch({
            command: c,
            transition: draft.frame.transition,
            row: {
              canonical_payload: canonicalSerialize(value),
              causation_command_id: c.commandId,
              fingerprint: canonical.fingerprint,
            },
            sha256Hex: sha,
          });
        },
      );
      const lease = parseWorldWriterLease({
          schemaVersion: 'world-writer-lease-v1',
          worldId: world,
          holderId: text(r.holder_id),
          fencingToken: text(r.fencing_token),
          acquiredAtReal: text(r.acquired_at_real),
          renewedAtReal: text(r.renewed_at_real),
          expiresAtReal: text(r.lease_expires_at_real),
        }),
        binding = Object.freeze({
          schemaVersion: 'postwar-industry-logistics-read-binding-v1',
          worldId: world,
          seedFingerprint: facts.seedPins.seedFingerprint,
          sourceSha256: facts.firstdayOriginal.rawSha256,
          commandFingerprint: c.fingerprint,
          authorizationTeamId: text(r.team_id),
          authorizationVersion: text(r.authorization_version),
          sourceFingerprint: hash(utilitySource),
          currentHead: head,
          prefixFingerprint: facts.prefixFingerprint,
          pageChainFingerprint: facts.pageChainFingerprint,
          transitionFingerprint: hash(draft.frame.transition),
        });
      return {
        frame: draft.frame,
        inventoryPostings,
        financialPostingBatches,
        binding,
        head,
        commitAssertion: createWorldWriterCommitAssertion(
          lease,
          head.worldVersion,
        ),
      };
    } finally {
      releasePostwarIndustryRunStateContext(ctx);
    }
  }
  const port: Readonly<IndustryLogisticsSourceCommitProtectionPort> =
    Object.freeze({
      async assertCurrentFrom(
        tx: SqlExecutor,
        r: Readonly<IndustryLogisticsSourceCommitRequest>,
      ) {
        return track(async () => {
          if (active.has(tx)) fail('REENTRANT_CUTOFF');
          active.add(tx);
          try {
            if (
              r.phase !== 'BEFORE_EVENTS' ||
              r.purpose !== INDUSTRY_LOGISTICS_SOURCE_PURPOSE ||
              r.currentMaterializations.length
            )
              fail('FIXED_LOGISTICS_EFFECT_REQUIRED');
            await authorized(r.command, r.commitAuthorization);
            const fresh = await derive(tx, r.command, r.observedAtReal);
            if (
              !same(fresh.head, r.currentHead) ||
              !same(fresh.binding, r.readBinding) ||
              !same(fresh.frame.transition, r.transition) ||
              !same(fresh.financialPostingBatches, r.financialPostingBatches) ||
              !same(fresh.inventoryPostings, r.inventoryPostings) ||
              fresh.binding.authorizationTeamId !==
                r.commitAuthorization!.teamId ||
              fresh.binding.authorizationVersion !==
                r.commitAuthorization!.authorizationVersion
            )
              fail('CURRENT_SOURCE_OR_RESOURCE_EFFECT_CHANGED');
            return Object.freeze({
              status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY' as const,
              purpose: INDUSTRY_LOGISTICS_SOURCE_PURPOSE,
              commandFingerprint: r.command.fingerprint,
              currentHead: r.currentHead,
              readBindingFingerprint: hash(fresh.binding),
              protectionMode: 'HELD_SOURCE_GUARDS' as const,
            });
          } finally {
            active.delete(tx);
          }
        });
      },
    });
  guards.set(port, ready);
  const candidateFactory: Readonly<AtomicTransitionCandidateFactory> =
    Object.freeze({
      async prepare(
        input: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
      ): Promise<AtomicTransitionDraft> {
        return track(async () => {
          await authorized(input.command, input.commitAuthorization);
          const f = await config.database.transaction((tx) =>
            derive(tx, input.command, input.observedAtReal),
          );
          return Object.freeze({
            transition: f.frame.transition,
            receipt: f.frame.receipt,
            financialPostingBatches: f.financialPostingBatches,
            inventoryPostings: f.inventoryPostings,
            outboxMessages: [],
            currentMaterializations: [],
            authorityKind: 'DISCRETIONARY_USER',
            commitAuthorization: input.commitAuthorization,
            commitAssertion: f.commitAssertion,
            observedAtReal: input.observedAtReal,
            officeOperatingSourceReadBinding: f.binding,
          });
        });
      },
    });
  async function readPlanningFrom(
    tx: SqlExecutor,
    input: Readonly<{
      countryId: string;
      expectedHead: Readonly<
        Pick<
          IndustryLogisticsSourceCommitRequest['currentHead'],
          'worldVersion' | 'eventSequence'
        >
      >;
      context: Readonly<PostwarIndustryRunStateContext>;
    }>,
  ) {
    if (!ready())
      throw new PostwarIndustryLogisticsSourceMissing('SOURCE_NOT_PREPARED');
    const facts = consumePostwarIndustryRunStateFrom(tx, input.context);
    if (
      facts.head.worldId !== world ||
      !same(
        {
          worldVersion: facts.head.worldVersion,
          eventSequence: facts.head.eventSequence,
        },
        input.expectedHead,
      ) ||
      facts.firstdayOriginal.data.countryId !== input.countryId
    )
      fail('ACTUAL_SAME_EXECUTOR_PLANNING_SCOPE_REQUIRED');
    const role = await tx.query<{ role_name: string }>(
      'select current_user as role_name',
    );
    if (role.rows.length !== 1 || role.rows[0]!.role_name !== workerRole)
      fail('ACTUAL_PLANNING_WORKER_EXECUTOR_REQUIRED');
    const runs = readIndustryFirstDayWorkState(facts.workState).runs.filter(
      (r) =>
        r.source.countryId === input.countryId &&
        r.source.facilityId === facts.firstdayOriginal.data.facilityId,
    );
    if (!runs.length) {
      const original = projectPostwarIndustryLogisticsReplaySources({
        baseline: facts.baseline,
        context: source!.context,
        firstday: facts.firstdayOriginal,
        runIds: [],
        policyBytes: source!.policyBytes,
        expenseOriginals: [],
      });
      return Object.freeze({
        head: facts.head,
        rows: Object.freeze([]),
        prefixFingerprint: facts.prefixFingerprint,
        pageChainFingerprint: facts.pageChainFingerprint,
        sourceOriginalsFingerprint: hash({
          physical: original.physical,
          labour: original.labour,
          registeredParent: {
            sourceRef: facts.firstdayOriginal.sourceRef,
            sha256: facts.firstdayOriginal.rawSha256,
          },
        }),
      });
    }
    let projected:
        | Awaited<
            ReturnType<typeof readPostwarIndustryLogisticsReplaySourcesFrom>
          >
        | undefined,
      failure: unknown;
    try {
      await tx.query('set local role world_v2_industry_source_reader');
      projected = await readPostwarIndustryLogisticsReplaySourcesFrom(tx, {
        baseline: facts.baseline,
        worldId: world,
        countryId: input.countryId,
        facilityId: text(facts.firstdayOriginal.data.facilityId),
        runIds: runs.map((r) => r.terms.runId),
        expectedHead: facts.head,
      });
    } catch (e) {
      failure = e;
    }
    try {
      await tx.query('set local role "' + workerRole + '"');
    } catch (restore) {
      if (failure !== undefined)
        throw new AggregateError(
          [failure, restore],
          'Logistics planning role restore failed',
          { cause: restore },
        );
      throw restore;
    }
    if (failure !== undefined) throw failure;
    if (!projected) fail('ACTUAL_PLANNING_SOURCE_REQUIRED');
    const original = readIndustryInternalLogisticsReplaySources(
        projected.source,
      ),
      states =
        facts.pagedReplay.result.industryLogisticsState
          ?.map(readIndustryInternalLogisticsExecutionState)
          .filter(
            (s) =>
              s.source.countryId === input.countryId &&
              s.source.facilityId === original.facilityId,
          ) ?? [];
    if (states.length > 1) fail('UNIQUE_ACTUAL_LOGISTICS_STATE_REQUIRED');
    const rows: IndustryUtilityPlanningRow[] = [];
    for (const run of runs) {
      const utility = projected.utilitySources.find(
        (s) => s.runId === run.terms.runId,
      );
      if (!utility) fail('ACTUAL_RUN_PLANNING_SOURCE_REQUIRED');
      const common = {
        schemaVersion: 'postwar-industry-utility-planning-row-v1',
        countryId: input.countryId,
        facilityId: original.facilityId,
        locationId: run.source.locationId,
        operatorId: original.operatorId,
        runId: run.terms.runId,
        sourceRef: utility.sourceRef,
        sourceRawSha256: utility.sourceRawSha256,
        runStartsAtSimTime: run.terms.startsAtSimTime,
        runEndsAtSimTime: run.terms.endsAtSimTime,
        serviceKind: 'LOGISTICS',
        measurement: 'PLANNING_DATA_NOT_AUTHORITY',
      };
      const row = (action: string, parameters: unknown, key: string) =>
        parseIndustryUtilityPlanningRow({
          ...common,
          action,
          parameters,
          planningRef:
            'LOGISTICS_PLAN_' +
            sha(
              canonicalSerialize([
                world,
                input.countryId,
                run.terms.runId,
                action,
                key,
              ]),
            ).toUpperCase(),
        });
      const stock = facts.inventory.balances.filter(
        (p) =>
          p.account.countryId === input.countryId &&
          p.account.batchId === original.batchId &&
          p.account.bucket === 'AVAILABLE' &&
          p.account.physicalLocationId === original.fromLocationId &&
          p.account.titleHolderId === original.titleHolderId &&
          p.account.riskBearerId === original.riskBearerId,
      );
      if (stock.length > 1) fail('EXACT_CURRENT_WAREHOUSE_ACCOUNT_REQUIRED');
      rows.push(
        row(
          'BOOK',
          {
            quantityUnit: original.unit,
            fromLocationId: original.fromLocationId,
            toLocationId: original.toLocationId,
            materialRef: original.commodityId,
            titleHolderId: original.titleHolderId,
            riskBearerId: original.riskBearerId,
            capacityFacts: [
              {
                name: 'available_warehouse_quantity',
                value: stock[0]?.quantity.amount.toString() ?? '0',
                unit: original.unit,
              },
              {
                name: 'route_capacity',
                value: original.capacityTonnesPerSimDay,
                unit: 'tonnes/sim_day',
              },
              {
                name: 'mass_per_unit',
                value: original.tonnesPerUnit,
                unit: 'tonnes/' + original.unit,
              },
              {
                name: 'raw_route_status',
                value: original.rawRouteStatus,
                unit: 'source_classification',
              },
            ],
          },
          'BOOK',
        ),
      );
      for (const transfer of states[0]?.transfers ?? []) {
        const plan = readIndustryInternalLogisticsPlan(transfer.plan);
        if (plan.request.runId !== run.terms.runId) continue;
        const transferId = plan.request.transferId;
        if (transfer.status === 'RESERVED')
          rows.push(
            row(
              'SHIP',
              { operation: { action: 'SHIP', transferId } },
              transferId,
            ),
          );
        if (transfer.status === 'IN_TRANSIT')
          for (const order of original.workOriginals) {
            const body = JSON.parse(order.rawText) as Record<string, unknown>;
            if (
              body.transferId === transferId &&
              body.runId === run.terms.runId
            )
              rows.push(
                row(
                  'SERVICE_WORK',
                  {
                    operation: {
                      action: 'SERVICE_WORK',
                      transferId,
                      workOrderRef: order.reference,
                      workOrderSha256: order.rawSha256,
                    },
                  },
                  order.reference,
                ),
              );
          }
        if (transfer.work && transfer.status !== 'DELIVERED')
          for (const order of original.expenseOriginals) {
            const body = JSON.parse(order.rawText) as Record<string, unknown>;
            if (
              body.transferId === transferId &&
              body.runId === run.terms.runId &&
              body.workEventFingerprint ===
                transfer.work.frame.events[0]!.fingerprint &&
              !transfer.payments.some(
                (p) => p.original.reference === order.reference,
              )
            )
              rows.push(
                row(
                  'PAY_INPUTS',
                  {
                    operation: {
                      action: 'PAY_INPUTS',
                      transferId,
                      workEventFingerprint: body.workEventFingerprint,
                      expenseOrderRef: order.reference,
                      expenseOrderSha256: order.rawSha256,
                    },
                  },
                  order.reference,
                ),
              );
          }
        if (transfer.status === 'PAID')
          rows.push(
            row(
              'DELIVER',
              { operation: { action: 'DELIVER', transferId } },
              transferId,
            ),
          );
      }
    }
    return Object.freeze({
      head: facts.head,
      rows: Object.freeze(rows),
      prefixFingerprint: facts.prefixFingerprint,
      pageChainFingerprint: facts.pageChainFingerprint,
      sourceOriginalsFingerprint: hash({
        source: original,
        registeredParent: {
          sourceRef: facts.firstdayOriginal.sourceRef,
          sha256: facts.firstdayOriginal.rawSha256,
        },
      }),
    });
  }
  const runtime: Readonly<PostwarIndustryLogisticsRuntime> = Object.freeze({
    worldId: world,
    database: config.database,
    candidateFactory,
    sourceCommitProtectionPort: port,
    readPlanningScope(countryId: string) {
      if (!ready() || !source) return null;
      const policy = JSON.parse(source.policyBytes.policy) as {
        scope?: { country?: unknown; facility?: unknown };
      };
      if (policy.scope?.country !== countryId) return null;
      return Object.freeze({
        worldId: world,
        countryId,
        facilityId: text(policy.scope.facility),
      });
    },
    readPlanningFrom: (
      tx: SqlExecutor,
      input: Parameters<typeof readPlanningFrom>[1],
    ) => track(() => readPlanningFrom(tx, input)),
    async prepare(preparation: Readonly<PostwarIndustryLogisticsPreparation>) {
      if (source) fail('LOGISTICS_SOURCE_ALREADY_PREPARED');
      if (preparing) return preparing;
      const operation = track(async () => {
        const baseline = readPostwarSocialRuntimeFinancialReplayBase(
            social,
            world,
          ),
          b = consumePreparedPostwarSocialFinancialReplayBase(baseline),
          seed = preparation.startupSeed;
        if (
          !isValidatedOpeningSeed(seed) ||
          seed.worldId !== world ||
          seed.seedId !== b.pins.seedRef ||
          seed.fingerprint !== b.pins.contentHash
        )
          fail('ACTUAL_PREPARED_OPENING_SEED_REQUIRED');
        const [context, policyBytes] = await Promise.all([
          config.sourceContext ??
            loadPostwarSourceContext(preparation.repositoryRoot),
          loadPostwarIndustryLogisticsPolicy(preparation.repositoryRoot),
        ]);
        if (
          sha(context.sourceBytes.checksumsBytes) !==
          b.document.inputs.sourceChecksumsSha256
        )
          fail('ACTUAL_E03_SOURCE_CHECKSUMS_REQUIRED');
        const configuration = Object.freeze({ context, policyBytes });
        bindPostwarIndustryLogisticsSourceConfiguration(
          baseline,
          configuration,
        );
        source = configuration;
        preparedBase = baseline;
      });
      preparing = operation;
      try {
        await operation;
      } finally {
        preparing = undefined;
      }
    },
    async assertSourceBeforeClaim(
      command: CanonicalCommand,
      observedAtReal: string,
    ) {
      return track(async () => {
        await config.database.transaction(async (tx) => {
          await derive(tx, command, observedAtReal);
        });
      });
    },
    async close() {
      closed = true;
      await Promise.allSettled([...pending]);
      if (preparedBase)
        retirePostwarIndustryLogisticsSourceConfiguration(preparedBase);
      preparedBase = undefined;
      source = undefined;
    },
  });
  runtimes.set(runtime, { live, ready });
  return runtime;
}
