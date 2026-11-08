import type { IndustryUtilityPlanningRow } from '@econmind/core/postwar-industry-utility-planning-contract';
import { readIndustryFirstDayPowerState } from '@econmind/core/industry-first-day-power-execution';
import {
  readIndustryFirstDayWorkState,
  readIndustryCompletedWork,
} from '@econmind/core/industry-first-day-work';
import type { PostwarIndustryRunStateContext } from './postwar-industry-run-state.js';
import {
  createPostwarIndustryWaterGrantPublisher,
  type PostwarIndustryWaterGrantPublisher,
} from './postwar-industry-water-grant-publisher.js';
import type { PostwarIndustryWorkPublicationClock } from './postwar-industry-work-publisher.js';
/** Fixed manual POWER booking / WATER dispatch. Actual resource effects are
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
  createFinalCommandReceipt,
  type CanonicalCommand,
  type CommitAuthorizationProof,
} from '@econmind/core';
import {
  parseIndustryUtilityManualIntent,
  parseIndustryUtilityAutomaticWaterGrantIntent,
  prepareIndustryUtilityExecution,
} from '@econmind/core/industry-utility-execution';
import { prepareIndustryFirstDayPowerExecution } from '@econmind/core/industry-first-day-power-execution';
import { prepareIndustryFirstDayWaterExecution } from '@econmind/core/industry-first-day-water-execution';
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
} from './postwar-industry-run-state.js';
import {
  consumePostwarIndustryUtilitySource,
  assertPostwarIndustryUtilitySourceFrom,
  retirePostwarIndustryUtilitySource,
  takePostwarIndustryUtilitySourceOwnership,
  PostwarIndustryUtilitySourceMissing,
  utilitySourceForRun,
  type PreparedPostwarIndustryUtilitySource,
} from './postwar-industry-utility-source.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
  PreparedCurrentMaterialization,
} from './atomic-transition-repository.js';
export { PostwarIndustryUtilitySourceMissing } from './postwar-industry-utility-source.js';
export const INDUSTRY_UTILITY_SOURCE_PURPOSE =
  'POSTWAR_INDUSTRY_UTILITY_SOURCE_RECHECK_V1' as const;
export type IndustryUtilitySourceCommitRequest = Omit<
  IndustryRunSourceCommitRequest,
  'purpose'
> & {
  readonly purpose: typeof INDUSTRY_UTILITY_SOURCE_PURPOSE;
  readonly currentMaterializations: readonly PreparedCurrentMaterialization[];
};
export interface IndustryUtilitySourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<IndustryUtilitySourceCommitRequest>,
  ): Promise<
    Readonly<{
      status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
      purpose: typeof INDUSTRY_UTILITY_SOURCE_PURPOSE;
      commandFingerprint: string;
      currentHead: IndustryUtilitySourceCommitRequest['currentHead'];
      readBindingFingerprint: string;
      protectionMode: 'HELD_SOURCE_GUARDS';
    }>
  >;
}
export interface PostwarIndustryUtilityRuntime {
  readonly worldId: string;
  readonly database: SqlDatabase;
  readonly candidateFactory: Readonly<AtomicTransitionCandidateFactory>;
  readonly sourceCommitProtectionPort: Readonly<IndustryUtilitySourceCommitProtectionPort>;
  prepare(
    source: Readonly<PreparedPostwarIndustryUtilitySource>,
  ): Promise<void>;
  assertSourceBeforeClaim(
    command: CanonicalCommand,
    observedAtReal: string,
  ): Promise<void>;
  publishWaterGrant(
    scope: Readonly<{ countryId: string; facilityId: string; runId: string }>,
  ): ReturnType<PostwarIndustryWaterGrantPublisher['publish']>;
  /** Transport DATA only: exactly the genuine sources accepted by this owner. */
  readPreparedSites(): readonly Readonly<{
    worldId: string;
    countryId: string;
    facilityId: string;
  }>[];
  readPlanningScope(countryId: string): Readonly<{
    worldId: string;
    countryId: string;
    facilityId: string;
  }> | null;
  readPlanningFrom(
    tx: SqlExecutor,
    input: Readonly<{
      countryId: string;
      expectedHead: { worldVersion: string; eventSequence: string };
      context: Readonly<PostwarIndustryRunStateContext>;
    }>,
  ): Promise<
    Readonly<{
      head: IndustryRunSourceCommitRequest['currentHead'];
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
export function isPostwarIndustryUtilityRuntime(
  v: unknown,
): v is Readonly<PostwarIndustryUtilityRuntime> {
  return !!v && typeof v === 'object' && runtimes.get(v)?.live() === true;
}
export function isPreparedPostwarIndustryUtilityRuntime(
  v: unknown,
): v is Readonly<PostwarIndustryUtilityRuntime> {
  return !!v && typeof v === 'object' && runtimes.get(v)?.ready() === true;
}
export function isPostwarIndustryUtilitySourceCommitProtectionPort(
  v: unknown,
): v is Readonly<IndustryUtilitySourceCommitProtectionPort> {
  return !!v && typeof v === 'object' && guards.get(v)?.() === true;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex'),
  hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha),
  same = (a: unknown, b: unknown) =>
    canonicalSerialize(a) === canonicalSerialize(b);
function fail(s: string): never {
  throw Error('INDUSTRY_UTILITY:' + s);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v) fail('ACTUAL_SCOPE_FIELD_REQUIRED');
  return v;
}
/** Closed DATA classifier only. Authority still requires this runtime's
 * private source port and the actual registered publication/claimed task. */
export function isPostwarIndustryWaterGrantCommand(
  command: CanonicalCommand,
): boolean {
  try {
    parseIndustryUtilityAutomaticWaterGrantIntent(command, sha);
    return true;
  } catch {
    return false;
  }
}
export function createPostwarIndustryUtilityRuntime(config: {
  readonly database: SqlDatabase;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly publication?: Readonly<{
    database: SqlDatabase;
    clock: Readonly<PostwarIndustryWorkPublicationClock>;
  }>;
}): Readonly<PostwarIndustryUtilityRuntime> {
  const social = config.socialConnection;
  if (!isPostwarSocialRuntimeConnection(social, social?.worldId))
    fail('GENUINE_SOCIAL_CONNECTION_REQUIRED');
  const world = social.worldId,
    worker = social.workerId,
    { workerRole } = readPostwarSocialRuntimeConnectionResources(social);
  interface InstalledSite {
    readonly source: Readonly<PreparedPostwarIndustryUtilitySource>;
    publisher: Readonly<PostwarIndustryWaterGrantPublisher> | undefined;
  }
  const installed = new Map<string, InstalledSite>();
  const siteKey = (site: Readonly<{ countryId: string; facilityId: string }>) =>
    site.countryId + '\0' + site.facilityId;
  let closed = false,
    closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>(),
    active = new WeakSet<object>(),
    owner = Object.freeze({}),
    live = () => !closed && isPostwarSocialRuntimeConnection(social, world),
    ready = () => {
      if (!live() || !installed.size) return false;
      try {
        for (const entry of installed.values())
          consumePostwarIndustryUtilitySource(entry.source, social);
        return true;
      } catch {
        return false;
      }
    };
  function sourceFor(
    site: Readonly<{ countryId: string; facilityId: string }>,
  ): InstalledSite {
    if (!live()) fail('RUNTIME_RETIRED');
    const entry = installed.get(siteKey(site));
    if (!entry)
      throw new PostwarIndustryUtilitySourceMissing(
        'REGISTERED_UTILITY_SITE_NOT_PREPARED',
      );
    const p = consumePostwarIndustryUtilitySource(entry.source, social);
    if (
      p.compact.worldId !== world ||
      p.compact.countryId !== site.countryId ||
      p.compact.facilityId !== site.facilityId
    )
      fail('EXACT_INSTALLED_SITE_SOURCE_REQUIRED');
    return entry;
  }
  function sitesForCountry(countryId: string) {
    return [...installed.values()].filter(
      (entry) =>
        consumePostwarIndustryUtilitySource(entry.source, social).compact
          .countryId === countryId,
    );
  }
  function track<T>(run: () => Promise<T>): Promise<T> {
    if (!live()) return Promise.reject(Error('INDUSTRY_UTILITY_RETIRED'));
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
  async function derive(
    tx: SqlExecutor,
    c: CanonicalCommand,
    at: string,
    beforeClaim = false,
  ) {
    if (!ready())
      throw new PostwarIndustryUtilitySourceMissing('SOURCE_NOT_PREPARED');
    const automatic = isPostwarIndustryWaterGrantCommand(c);
    const intent = automatic
        ? parseIndustryUtilityAutomaticWaterGrantIntent(c, sha)
        : parseIndustryUtilityManualIntent(c, sha),
      source = sourceFor({
        countryId: c.countryId,
        facilityId: intent.facilityId,
      }).source,
      p = consumePostwarIndustryUtilitySource(source, social);
    if (
      c.worldId !== world ||
      c.expectedWorldVersion === null ||
      c.idempotencyKey === null ||
      c.countryId !== p.compact.countryId ||
      intent.facilityId !== p.compact.facilityId ||
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
        await tx.query<Record<string, unknown>>(
          automatic
            ? beforeClaim
              ? 'select * from world_v2.read_postwar_industry_water_grant_preclaim_scope($1,$2,$3,$4,$5::timestamptz,$6)'
              : 'select * from world_v2.lock_postwar_industry_water_grant_scope($1,$2,$3,$4,$5::timestamptz,$6)'
            : INDUSTRY_RUN_SCOPE_QUERY,
          automatic
            ? [
                world,
                c.commandId,
                c.fingerprint,
                worker,
                at,
                c.simTime.toCanonicalValue(),
              ]
            : [
                world,
                c.countryId,
                c.authSubject,
                worker,
                c.expectedWorldVersion,
                at,
              ],
        )
      ).rows;
      if (rows.length !== 1) fail('ACTUAL_LEASE_HEAD_ACTOR_SEAT_REQUIRED');
      await assertPostwarIndustryUtilitySourceFrom(tx, {
        preparation: source,
        head: {
          worldVersion: text(rows[0]!.world_version),
          eventSequence: text(rows[0]!.event_sequence),
        },
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
      const utilitySource = utilitySourceForRun(
          source,
          intent.serviceKind === 'POWER' ? 'POWER' : 'WATER',
          intent.runId,
        ),
        preparation = prepareIndustryUtilityExecution(
          { command: c, replay: facts.pagedReplay, source: utilitySource },
          sha,
        ),
        state =
          intent.serviceKind === 'POWER'
            ? facts.pagedReplay.result.industryPowerState
            : facts.pagedReplay.result.industryWaterState;
      if (!state)
        throw new PostwarIndustryUtilitySourceMissing(
          'ACTUAL_UTILITY_REPLAY_STATE_MISSING',
        );
      const draft =
          intent.serviceKind === 'POWER'
            ? prepareIndustryFirstDayPowerExecution(
                {
                  preparation,
                  state: facts.pagedReplay.result.industryPowerState!,
                },
                sha,
              )
            : prepareIndustryFirstDayWaterExecution(
                {
                  preparation,
                  state: facts.pagedReplay.result.industryWaterState!,
                },
                sha,
              ),
        lease = parseWorldWriterLease({
          schemaVersion: 'world-writer-lease-v1',
          worldId: world,
          holderId: text(r.holder_id),
          fencingToken: text(r.fencing_token),
          acquiredAtReal: text(r.acquired_at_real),
          renewedAtReal: text(r.renewed_at_real),
          expiresAtReal: text(r.lease_expires_at_real),
        }),
        binding = Object.freeze({
          schemaVersion: 'postwar-industry-utility-read-binding-v1',
          worldId: world,
          seedFingerprint: p.compact.seedFingerprint,
          admissionRef: p.compact.admissionRef,
          sourceSha256: p.compactSha256,
          commandFingerprint: c.fingerprint,
          sourceFingerprint: hash(utilitySource),
          currentHead: head,
          prefixFingerprint: facts.prefixFingerprint,
          pageChainFingerprint: facts.pageChainFingerprint,
          transitionFingerprint: hash(draft.step.transition),
        });
      return {
        step: draft.step,
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
  const port: Readonly<IndustryUtilitySourceCommitProtectionPort> =
    Object.freeze({
      async assertCurrentFrom(
        tx: SqlExecutor,
        r: Readonly<IndustryUtilitySourceCommitRequest>,
      ) {
        return track(async () => {
          if (active.has(tx)) fail('REENTRANT_CUTOFF');
          active.add(tx);
          try {
            if (
              r.phase !== 'BEFORE_EVENTS' ||
              r.purpose !== INDUSTRY_UTILITY_SOURCE_PURPOSE ||
              r.currentMaterializations.length ||
              r.financialPostingBatches.length ||
              r.inventoryPostings.length
            )
              fail('FIXED_ZERO_JOURNAL_UTILITY_EFFECT_REQUIRED');
            if (isPostwarIndustryWaterGrantCommand(r.command)) {
              if (r.commitAuthorization !== null)
                fail('AUTOMATIC_GRANT_HAS_NO_USER_PROOF');
            } else await authorized(r.command, r.commitAuthorization);
            const fresh = await derive(tx, r.command, r.observedAtReal);
            if (
              !same(fresh.head, r.currentHead) ||
              !same(fresh.binding, r.readBinding) ||
              !same(fresh.step.transition, r.transition)
            )
              fail('CURRENT_SOURCE_OR_RESOURCE_EFFECT_CHANGED');
            return Object.freeze({
              status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY' as const,
              purpose: INDUSTRY_UTILITY_SOURCE_PURPOSE,
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
  guards.set(port, live);
  const candidateFactory: Readonly<AtomicTransitionCandidateFactory> =
    Object.freeze({
      async prepare(
        input: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
      ): Promise<AtomicTransitionDraft> {
        return track(async () => {
          const automatic = isPostwarIndustryWaterGrantCommand(input.command);
          if (automatic) {
            if (input.commitAuthorization !== null)
              fail('AUTOMATIC_GRANT_HAS_NO_USER_PROOF');
          } else await authorized(input.command, input.commitAuthorization);
          const f = await config.database.transaction((tx) =>
            derive(tx, input.command, input.observedAtReal),
          );
          return Object.freeze({
            transition: f.step.transition,
            receipt: createFinalCommandReceipt({
              command: input.command,
              transition: f.step.transition,
              outcome: 'COMMITTED',
              reasonCode: null,
              simTime: input.command.simTime,
              recordedAtReal: input.observedAtReal,
            }),
            financialPostingBatches: [],
            inventoryPostings: [],
            outboxMessages: [],
            currentMaterializations: [],
            authorityKind: automatic
              ? 'VERSIONED_AUTOMATIC'
              : 'DISCRETIONARY_USER',
            commitAuthorization: input.commitAuthorization,
            commitAssertion: f.commitAssertion,
            observedAtReal: input.observedAtReal,
            officeOperatingSourceReadBinding: f.binding,
          });
        });
      },
    });
  const runtime: Readonly<PostwarIndustryUtilityRuntime> = Object.freeze({
    worldId: world,
    database: config.database,
    candidateFactory,
    sourceCommitProtectionPort: port,
    async prepare(preparation: Readonly<PreparedPostwarIndustryUtilitySource>) {
      if (!live()) fail('RUNTIME_RETIRED_BEFORE_SOURCE_TRANSFER');
      const p = consumePostwarIndustryUtilitySource(preparation, social),
        key = siteKey(p.compact),
        existing = installed.get(key);
      if (p.compact.worldId !== world) fail('SAME_WORLD_SOURCE_REQUIRED');
      if (existing && existing.source !== preparation)
        fail('UTILITY_SITE_SOURCE_ALREADY_PREPARED');
      takePostwarIndustryUtilitySourceOwnership(preparation, owner);
      const entry: InstalledSite = existing ?? {
        source: preparation,
        publisher: undefined,
      };
      installed.set(key, entry);
      if (config.publication && !entry.publisher)
        entry.publisher = createPostwarIndustryWaterGrantPublisher({
          database: config.database,
          publicationDatabase: config.publication.database,
          socialConnection: social,
          sourcePreparation: preparation,
          clock: config.publication.clock,
        });
      return track(async () => {
        consumePostwarIndustryUtilitySource(preparation, social);
      });
    },
    async assertSourceBeforeClaim(
      command: CanonicalCommand,
      observedAtReal: string,
    ) {
      if (!ready())
        throw new PostwarIndustryUtilitySourceMissing('SOURCE_NOT_PREPARED');
      const intent = isPostwarIndustryWaterGrantCommand(command)
        ? parseIndustryUtilityAutomaticWaterGrantIntent(command, sha)
        : parseIndustryUtilityManualIntent(command, sha);
      sourceFor({
        countryId: command.countryId,
        facilityId: intent.facilityId,
      });
      return track(async () => {
        await config.database.transaction(async (tx) => {
          await derive(tx, command, observedAtReal, true);
        });
      });
    },
    async publishWaterGrant(
      scope: Readonly<{ countryId: string; facilityId: string; runId: string }>,
    ) {
      if (!live()) return Promise.reject(Error('INDUSTRY_UTILITY_RETIRED'));
      const publisher = sourceFor(scope).publisher;
      if (!publisher)
        return Promise.reject(
          new PostwarIndustryUtilitySourceMissing(
            'WATER_GRANT_PUBLISHER_NOT_INSTALLED',
          ),
        );
      return track(() => publisher.publish(scope));
    },
    readPreparedSites() {
      if (!live()) return Object.freeze([]);
      return Object.freeze(
        [...installed.values()]
          .map((entry) => {
            const p = consumePostwarIndustryUtilitySource(entry.source, social);
            return Object.freeze({
              worldId: world,
              countryId: p.compact.countryId,
              facilityId: p.compact.facilityId,
            });
          })
          .sort(
            (a, b) =>
              a.countryId.localeCompare(b.countryId) ||
              a.facilityId.localeCompare(b.facilityId),
          ),
      );
    },
    readPlanningScope(countryId: string) {
      if (!ready()) return null;
      const matches = sitesForCountry(countryId);
      if (!matches.length) return null;
      if (matches.length !== 1)
        throw new PostwarIndustryUtilitySourceMissing(
          'EXACT_PLANNING_SITE_SELECTION_REQUIRED',
        );
      const p = consumePostwarIndustryUtilitySource(matches[0]!.source, social);
      return Object.freeze({
        worldId: world,
        countryId,
        facilityId: p.compact.facilityId,
      });
    },
    async readPlanningFrom(
      tx: SqlExecutor,
      input: Readonly<{
        countryId: string;
        expectedHead: { worldVersion: string; eventSequence: string };
        context: Readonly<PostwarIndustryRunStateContext>;
      }>,
    ) {
      return track(async () => {
        if (!ready())
          throw new PostwarIndustryUtilitySourceMissing('SOURCE_NOT_PREPARED');
        const facts = consumePostwarIndustryRunStateFrom(tx, input.context),
          source = sourceFor({
            countryId: input.countryId,
            facilityId: text(facts.firstdayOriginal.data.facilityId),
          }).source,
          p = consumePostwarIndustryUtilitySource(source, social);
        if (
          input.countryId !== p.compact.countryId ||
          facts.head.worldId !== world ||
          facts.head.worldVersion !== input.expectedHead.worldVersion ||
          facts.head.eventSequence !== input.expectedHead.eventSequence ||
          facts.seedPins.seedFingerprint !== p.compact.seedFingerprint
        )
          fail('SAME_EXECUTOR_CURRENT_PLANNING_SCOPE_REQUIRED');
        const session = await tx.query<{ role_name: string }>(
          'select current_user as role_name',
        );
        if (
          session.rows.length !== 1 ||
          session.rows[0]?.role_name !== workerRole
        )
          fail('ACTUAL_WORKER_EXECUTOR_REQUIRED');
        let failure: unknown;
        try {
          await tx.query('set local role world_v2_industry_source_reader');
          await assertPostwarIndustryUtilitySourceFrom(tx, {
            preparation: source,
            head: input.expectedHead,
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
              'Planning source role restore failed',
              { cause: restore },
            );
          throw restore;
        }
        if (failure !== undefined) throw failure;
        const state = facts.pagedReplay.result.industryPowerState,
          power = state
            ? readIndustryFirstDayPowerState(state, sha)
            : undefined,
          capacityFacts = [
            {
              name: '原储能能量容量',
              value: p.compact.power.originalEnergyCapacityMWh,
              unit: 'MWh',
            },
            {
              name: '原储能放电功率',
              value: p.compact.power.originalStorageDischargeMW,
              unit: 'MW',
            },
            {
              name: '原电网功率',
              value: p.compact.power.originalGridMW,
              unit: 'MW',
            },
            {
              name: '保留线路损耗比例',
              value: p.compact.power.originalLossFraction,
              unit: 'ratio',
            },
            ...(power?.physicalLedgerSnapshots.flatMap((x) => [
              {
                name: '当前剩余储能',
                value:
                  x.remainingSocMWh.numerator +
                  '/' +
                  x.remainingSocMWh.denominator,
                unit: 'MWh',
              },
              {
                name: '当前已预约未结算储能',
                value:
                  x.pendingStoredEnergyMWh.numerator +
                  '/' +
                  x.pendingStoredEnergyMWh.denominator,
                unit: 'MWh',
              },
              {
                name: '保留优先用途储能',
                value:
                  x.protectedStoredEnergyMWh.numerator +
                  '/' +
                  x.protectedStoredEnergyMWh.denominator,
                unit: 'MWh',
              },
            ]) ?? []),
          ],
          rows: IndustryUtilityPlanningRow[] = [];
        for (const run of readIndustryFirstDayWorkState(
          facts.workState,
        ).runs.filter(
          (r) =>
            r.source.countryId === input.countryId &&
            r.source.facilityId === p.compact.facilityId,
        )) {
          const src = utilitySourceForRun(source, 'POWER', run.terms.runId);
          for (const purpose of [
            'INDUSTRY_SELF_USE',
            'PROCESS_WATER_PUMPING_SELF_USE',
          ] as const)
            rows.push(
              Object.freeze({
                schemaVersion: 'postwar-industry-utility-planning-row-v1',
                planningRef:
                  'POWER_PLAN_' +
                  sha(
                    canonicalSerialize([
                      world,
                      facts.head,
                      run.frame.command.fingerprint,
                      purpose,
                    ]),
                  ).toUpperCase(),
                countryId: src.countryId,
                facilityId: src.facilityId,
                locationId: src.locationId,
                operatorId: src.operatorId,
                runId: src.runId,
                sourceRef: src.sourceRef,
                sourceRawSha256: src.sourceRawSha256,
                runStartsAtSimTime: run.terms.startsAtSimTime,
                runEndsAtSimTime: run.terms.endsAtSimTime,
                measurement: 'PLANNING_DATA_NOT_AUTHORITY',
                serviceKind: 'POWER',
                action: 'BOOK',
                parameters: Object.freeze({
                  purpose,
                  quantityUnit: 'MWh',
                  capacityFacts: Object.freeze(capacityFacts),
                }),
              }),
            );
        }
        // Only actual folded BOOK + distinct committed service WORK/WAGE refs
        // can produce a DELIVER planning row. No amount or result comes from UI.
        if (power) {
          const works = facts.completedWorks.map(readIndustryCompletedWork);
          for (const snapshot of power.physicalLedgerSnapshots) {
            for (const booking of snapshot.bookings) {
              const request = booking.request;
              if (
                booking.status !== 'BOOKED_NOT_DELIVERED' ||
                request.worldId !== world ||
                request.countryId !== input.countryId ||
                request.operatorId !== p.compact.operatorId ||
                request.storageId !== p.compact.power.storageId ||
                request.gridId !== p.compact.power.gridId
              )
                continue;
              const run = readIndustryFirstDayWorkState(
                facts.workState,
              ).runs.find(
                (r) =>
                  r.source.countryId === input.countryId &&
                  r.source.facilityId === p.compact.facilityId &&
                  r.terms.runId === request.runRef,
              );
              if (!run) continue;
              for (const payment of power.paymentFrames) {
                const body = JSON.parse(
                  payment.events[0]?.canonicalPayload ?? 'null',
                ) as unknown;
                if (!body || typeof body !== 'object' || Array.isArray(body))
                  continue;
                const paid = body as Record<string, unknown>,
                  event = payment.events[0];
                if (
                  paid.schemaVersion !== 'industry-operating-wage-paid-v1' ||
                  !event ||
                  typeof paid.workEventFingerprint !== 'string' ||
                  power.usedPaidEventFingerprints.includes(
                    paid.workEventFingerprint,
                  ) ||
                  power.usedPaidEventFingerprints.includes(event.fingerprint) ||
                  !facts.wageState?.paidWork.includes(paid.workEventFingerprint)
                )
                  continue;
                const work = works.find(
                  (w) =>
                    w.frame.events[0]?.fingerprint ===
                    paid.workEventFingerprint,
                );
                if (
                  !work ||
                  work.data.countryId !== input.countryId ||
                  work.data.operatorId !== p.compact.operatorId ||
                  work.data.facilityId !== p.compact.power.storageId ||
                  work.data.runId !== 'UTILITY_POWER_SERVICE_' + run.terms.runId
                )
                  continue;
                const from = BigInt(request.fromSimTime),
                  through = BigInt(request.throughSimTime),
                  points = [
                    ...new Set([
                      from,
                      through,
                      ...work.data.allocations
                        .flatMap((a) => [
                          BigInt(a.startsAtSimTime),
                          BigInt(a.endsAtSimTime),
                        ])
                        .filter((t) => t > from && t < through),
                    ]),
                  ];
                if (
                  points.some(
                    (t) =>
                      t < through &&
                      !work.data.allocations.some(
                        (a) =>
                          BigInt(a.count) > 0n &&
                          BigInt(a.startsAtSimTime) <= t &&
                          BigInt(a.endsAtSimTime) > t,
                      ),
                  )
                )
                  continue;
                const src = utilitySourceForRun(
                  source,
                  'POWER',
                  run.terms.runId,
                );
                rows.push(
                  Object.freeze({
                    schemaVersion: 'postwar-industry-utility-planning-row-v1',
                    planningRef:
                      'POWER_DELIVER_PLAN_' +
                      sha(
                        canonicalSerialize([
                          world,
                          facts.head,
                          request.bookingRef,
                          event.fingerprint,
                        ]),
                      ).toUpperCase(),
                    countryId: src.countryId,
                    facilityId: src.facilityId,
                    locationId: src.locationId,
                    operatorId: src.operatorId,
                    runId: src.runId,
                    sourceRef: src.sourceRef,
                    sourceRawSha256: src.sourceRawSha256,
                    runStartsAtSimTime: run.terms.startsAtSimTime,
                    runEndsAtSimTime: run.terms.endsAtSimTime,
                    measurement: 'PLANNING_DATA_NOT_AUTHORITY',
                    serviceKind: 'POWER',
                    action: 'DELIVER',
                    parameters: {
                      operation: {
                        action: 'DELIVER',
                        bookingRef: request.bookingRef,
                        workEventFingerprint: paid.workEventFingerprint,
                        paymentEventFingerprint: event.fingerprint,
                      },
                    },
                  }),
                );
              }
            }
          }
        }
        return Object.freeze({
          head: facts.head,
          rows: Object.freeze(rows),
          prefixFingerprint: facts.prefixFingerprint,
          pageChainFingerprint: facts.pageChainFingerprint,
          sourceOriginalsFingerprint: hash([
            p.compactSha256,
            power?.originalsFingerprint ?? null,
          ]),
        });
      });
    },
    async close() {
      closing ??= (async () => {
        closed = true;
        await Promise.allSettled([...pending]);
        const failures: unknown[] = [];
        for (const [key, entry] of installed) {
          try {
            await entry.publisher?.close();
            retirePostwarIndustryUtilitySource(entry.source, owner);
            installed.delete(key);
          } catch (error) {
            failures.push(error);
          }
        }
        if (failures.length)
          throw new AggregateError(
            failures,
            'Utility source owner cleanup failed',
          );
      })();
      return closing;
    },
  });
  runtimes.set(runtime, { live, ready });
  return runtime;
}
