/** Manual RUN planning through actual same-transaction custody and Core. A RUN
 * creates a bounded schedule only; no work, wage, delivery or output is implied. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  DomainError,
  DOMAIN_ERROR_CODES,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  parseWorldWriterLease,
  createWorldWriterCommitAssertion,
  Money,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type DecisionResultHead,
  type AuthoritativeTransition,
  type FinancialPostingBatch,
  type InventoryLedgerPosting,
} from '@econmind/core';
import {
  parseIndustryRunScheduleIntent,
  parseIndustryUtilisationTargetIntent,
  prepareIndustryUtilisationTargetFrame,
  INDUSTRY_UTILISATION_TARGET_COMMAND,
  prepareIndustryRunScheduleFrame,
  INDUSTRY_RUN_SCHEDULE_COMMAND,
  readIndustryFirstDayWorkState,
} from '@econmind/core/industry-first-day-work';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import {
  readPostwarIndustryRunStateFrom,
  consumePostwarIndustryRunStateFrom,
  releasePostwarIndustryRunStateContext,
} from './postwar-industry-run-state.js';
import { requirePostwarSocialSourceRevocationFence } from './postwar-social-position-runtime.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_RUN:' + s,
  );
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('EXACT_CURRENT_FIELD_REQUIRED');
  return v;
}
export const INDUSTRY_RUN_SOURCE_PURPOSE =
  'POSTWAR_INDUSTRY_RUN_SOURCE_RECHECK_V1' as const;
export const INDUSTRY_RUN_SCOPE_QUERY =
  'select * from world_v2.lock_postwar_industry_run_scope($1,$2,$3::uuid,$4,$5::bigint,$6::timestamptz)';
export interface IndustryRunSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof INDUSTRY_RUN_SOURCE_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
  readonly commitAuthorization: CommitAuthorizationProof | null;
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
  readonly inventoryPostings: readonly InventoryLedgerPosting[];
}
export interface IndustryRunSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<IndustryRunSourceCommitRequest>,
  ): Promise<
    Readonly<{
      status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
      purpose: typeof INDUSTRY_RUN_SOURCE_PURPOSE;
      commandFingerprint: string;
      currentHead: DecisionResultHead;
      readBindingFingerprint: string;
      protectionMode: 'HELD_SOURCE_GUARDS';
    }>
  >;
}
export interface PostwarIndustryRunRuntime {
  readonly worldId: string;
  readonly database: SqlDatabase;
  readonly candidateFactory: Readonly<AtomicTransitionCandidateFactory>;
  readonly sourceCommitProtectionPort: Readonly<IndustryRunSourceCommitProtectionPort>;
  assertSourceBeforeClaim(
    command: CanonicalCommand,
    observedAtReal: string,
  ): Promise<void>;
  close(): Promise<void>;
}
const runtimes = new WeakMap<object, () => boolean>();
const guards = new WeakMap<object, () => boolean>();
export function isPostwarIndustryRunRuntime(
  v: unknown,
): v is Readonly<PostwarIndustryRunRuntime> {
  return !!v && typeof v === 'object' && runtimes.get(v)?.() === true;
}
export function isPostwarIndustryRunSourceCommitProtectionPort(
  v: unknown,
): v is Readonly<IndustryRunSourceCommitProtectionPort> {
  return !!v && typeof v === 'object' && guards.get(v)?.() === true;
}
export function createPostwarIndustryRunRuntime(config: {
  readonly database: SqlDatabase;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
}): Readonly<PostwarIndustryRunRuntime> {
  const social = config.socialConnection;
  if (!isPostwarSocialRuntimeConnection(social, social?.worldId))
    invalid('GENUINE_SOCIAL_CONNECTION_REQUIRED');
  const { workerRole: role } =
      readPostwarSocialRuntimeConnectionResources(social),
    world = social.worldId,
    worker = social.workerId;
  requirePostwarSocialSourceRevocationFence(social.database, world);
  let closed = false;
  const pending = new Set<Promise<unknown>>(),
    active = new WeakSet<object>();
  const live = () => !closed && isPostwarSocialRuntimeConnection(social, world);
  const track = <T>(op: () => Promise<T>) => {
    if (!live()) return Promise.reject(Error('INDUSTRY_RUN_RETIRED'));
    const p = Promise.resolve().then(op);
    pending.add(p);
    void p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
    return p;
  };
  async function authorize(
    c: CanonicalCommand,
    p: CommitAuthorizationProof | null,
  ) {
    if (
      !isCommitAuthorizationProof(p) ||
      p.commandId !== c.commandId ||
      p.commandFingerprint !== c.fingerprint ||
      p.worldId !== world ||
      p.countryId !== c.countryId ||
      p.officeId !== 'INDUSTRY' ||
      p.capability !== 'INDUSTRY_PRODUCTION' ||
      p.authSubject !== c.authSubject ||
      p.actorId !== c.actorId
    )
      invalid('GENUINE_CURRENT_RUN_AUTHORIZATION_REQUIRED');
    await reauthorizeCommitAuthorizationProof(p);
  }
  async function derive(tx: SqlExecutor, c: CanonicalCommand, at: string) {
    if (!live()) invalid('LIVE_SOURCE_REQUIRED');
    const target = c.commandType === INDUSTRY_UTILISATION_TARGET_COMMAND;
    const terms = target
      ? parseIndustryUtilisationTargetIntent(c, sha)
      : parseIndustryRunScheduleIntent(c, sha);
    if (
      (!target && c.commandType !== INDUSTRY_RUN_SCHEDULE_COMMAND) ||
      c.worldId !== world ||
      c.officeId !== 'INDUSTRY' ||
      c.authSubject === null ||
      c.idempotencyKey === null ||
      c.expectedWorldVersion === null ||
      new Date(at).toISOString() !== at
    )
      invalid('EXACT_MANUAL_SCHEDULE_REQUIRED');
    const session = await tx.query<{ role_name: string }>(
      'select current_user as role_name',
    );
    if (session.rows.length !== 1 || session.rows[0]?.role_name !== role)
      invalid('ACTUAL_WORKER_EXECUTOR_REQUIRED');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      c.authSubject,
    ]);
    let rows: readonly Record<string, unknown>[] = [];
    let failure: unknown;
    try {
      await tx.query('set local role world_v2_industry_source_reader');
      if (target) {
        const installed = await tx.query<{ version: string }>(
          'select world_v2.postwar_utilisation_target_contract_version() as version',
        );
        if (
          installed.rows.length !== 1 ||
          installed.rows[0]?.version !==
            'postwar-industry-utilisation-target-v1'
        )
          invalid('TARGET_COMPLETE_PREFIX_CONTRACT_NOT_INSTALLED');
      }

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
    } catch (error) {
      failure = error;
    }
    try {
      await tx.query('set local role "' + role + '"');
    } catch (restore) {
      if (failure !== undefined)
        throw new AggregateError(
          [failure, restore],
          'Industry RUN source role restore failed',
          { cause: restore },
        );
      throw restore;
    }
    if (failure !== undefined) throw failure;
    if (rows.length !== 1) invalid('ACTUAL_CURRENT_SCOPE_REQUIRED');
    const r = rows[0]!;
    const head = {
      worldId: world,
      worldVersion: text(r.world_version),
      eventSequence: text(r.event_sequence),
    };
    const lease = parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: world,
      holderId: text(r.holder_id),
      fencingToken: text(r.fencing_token),
      acquiredAtReal: text(r.acquired_at_real),
      renewedAtReal: text(r.renewed_at_real),
      expiresAtReal: text(r.lease_expires_at_real),
    });
    const context = await readPostwarIndustryRunStateFrom(tx, {
      socialConnection: social,
      worldId: world,
      countryId: c.countryId,
      facilityId: terms.facilityId,
      expectedHead: head,
    });
    try {
      const facts = consumePostwarIndustryRunStateFrom(tx, context),
        base = consumePreparedPostwarSocialFinancialReplayBase(facts.baseline),
        sites = facts.siteSources.filter(
          (s) =>
            s.countryId === c.countryId && s.facilityId === terms.facilityId,
        );
      if (sites.length !== 1) invalid('EXACT_SITE_REQUIRED');
      if (c.simTime.ticks < BigInt(facts.maxCommandSimTimeTicks))
        invalid('COMMAND_TIME_PRECEDES_CURRENT_HISTORY');
      const site = sites[0]!;
      if (target) {
        if (
          facts.firstdayOriginal.data.schemaVersion !==
          'postwar-industry-first-day-source-v1'
        )
          invalid('TARGET_PRODUCTION_FACILITY_ORIGINAL_REQUIRED');
        const prepared = prepareIndustryUtilisationTargetFrame(
          { state: facts.workState, command: c, head, observedAtReal: at },
          sha,
        );
        return {
          frame: prepared.frame,
          head,
          binding: Object.freeze({
            schemaVersion:
              'postwar-industry-utilisation-target-current-binding-v1',
            commandFingerprint: c.fingerprint,
            observedAtReal: at,
            head,
            seedPins: facts.seedPins,
            sourceRef: facts.firstdayOriginal.sourceRef,
            sourceRawSha256: facts.firstdayOriginal.rawSha256,
            pageChainFingerprint: facts.pageChainFingerprint,
            siteFingerprint: hash(site),
            previousTargetsFingerprint: hash(
              readIndustryFirstDayWorkState(
                facts.workState,
              ).utilisationTargets.map((target) => ({
                terms: target.terms,
                commandFingerprint: target.frame.command.fingerprint,
                eventFingerprint: target.frame.events[0]!.fingerprint,
              })),
            ),
            authorizationTeamId: text(r.team_id),
            authorizationVersion: text(r.authorization_version),
          }),
          commitAssertion: createWorldWriterCommitAssertion(
            lease,
            head.worldVersion,
          ),
        };
      }
      // Only RUN reserves the scheduling cap. A target is never a reservation.
      if (!('maximumExpense' in terms)) invalid('EXACT_RUN_EXPENSE_REQUIRED');
      const accounts = base.document.inputs.fundingAccounts.filter(
        (a) =>
          a.countryId === c.countryId &&
          a.payerEntityId === site.operatorId &&
          a.payerRole === 'OP' &&
          a.accountClass === 'BUSINESS_DEPOSIT_ASSET',
      );
      if (accounts.length !== 1) invalid('ACTUAL_OPERATOR_FUNDING_REQUIRED');
      const account = accounts[0]!,
        expense = Money.from(
          terms.maximumExpense.amount,
          terms.maximumExpense.currency,
        ),
        positions = facts.financial.positions.filter(
          (p) =>
            p.account.accountId === account.accountRef &&
            p.account.ownerId === site.operatorId &&
            p.account.countryId === c.countryId &&
            p.account.currency === expense.currency,
        );
      if (
        account.currency !== expense.currency ||
        positions.length !== 1 ||
        positions[0]!.netDebitBalance.amount.lessThan(expense.amount)
      )
        invalid('FINITE_SCHEDULE_CURRENT_OPERATOR_BALANCE_REQUIRED');
      const openingFunding = base.funding.filter(
        (f) => f.accountId === account.accountRef,
      );
      if (
        openingFunding.length !== 1 ||
        openingFunding[0]!.fundingId !== account.accountRef ||
        openingFunding[0]!.countryId !== c.countryId ||
        openingFunding[0]!.payerEntityId !== site.operatorId ||
        openingFunding[0]!.currency !== expense.currency ||
        !Money.from(
          openingFunding[0]!.ceilingAmount,
          expense.currency,
        ).amount.equals(
          Money.from(account.reservedAmount, expense.currency).amount,
        )
      )
        invalid('EXACT_AGGREGATE_OPENING_OPERATOR_RESERVATION_REQUIRED');
      const asset = positions[0]!.account;
      const mirrors = facts.financial.positions.filter(
        (p) =>
          p.account.accountClass === 'LIABILITY' &&
          p.account.countryId === c.countryId &&
          p.account.ownerId === account.issuerEntityId &&
          p.account.counterpartyEntityId === site.operatorId &&
          p.account.currency === expense.currency &&
          p.account.claimId === asset.claimId,
      );
      if (
        asset.accountClass !== 'ASSET' ||
        asset.claimId === null ||
        asset.claimId !== account.claimId ||
        asset.counterpartyEntityId !== account.issuerEntityId ||
        mirrors.length !== 1 ||
        mirrors[0]!.account.accountId !== account.counterpartAccountId ||
        !positions[0]!.netDebitBalance
          .add(mirrors[0]!.netDebitBalance)
          .amount.isZero()
      )
        invalid('ACTUAL_MATCHED_OPERATOR_DEPOSIT_CLAIM_REQUIRED');
      // Scheduling is not payment or a new journal reservation. Admission
      // nevertheless retains all existing obligations and earlier schedule
      // caps. WORK, elapsed time and unpaid wage remainders never release cash.
      let retained = Money.from('0', expense.currency);
      const references = new Set<string>();
      const addRetained = (
        ref: string,
        accountId: string,
        owner: string,
        country: string,
        currency: string,
        amount: string,
      ) => {
        if (accountId !== account.accountRef) return;
        if (
          owner !== site.operatorId ||
          country !== c.countryId ||
          currency !== expense.currency ||
          references.has(ref)
        )
          invalid('EXACT_DISTINCT_OPERATOR_OBLIGATION_REQUIRED');
        const value = Money.from(amount, currency);
        if (value.amount.isNegative()) invalid('NEGATIVE_OPERATOR_OBLIGATION');
        references.add(ref);
        retained = retained.add(value);
      };
      for (const f of base.funding.filter(
        (f) => f.accountId === account.accountRef,
      )) {
        let remaining = Money.from(f.ceilingAmount, f.currency);
        for (const paid of facts.wageState?.reservationReleases ?? []) {
          if (paid.openingEncumbranceRef !== f.fundingId) continue;
          if (paid.accountId !== f.accountId || paid.currency !== f.currency)
            invalid('EXACT_PAID_OPENING_RELEASE_REQUIRED');
          const value = Money.from(paid.amount, paid.currency);
          if (value.amount.isNegative())
            invalid('NEGATIVE_PAID_OPENING_RELEASE');
          remaining = remaining.subtract(value);
        }
        addRetained(
          f.fundingId,
          f.accountId,
          f.payerEntityId,
          f.countryId,
          f.currency,
          remaining.amount.toString(),
        );
      }
      for (const r of facts.budgetEncumbrances)
        addRetained(
          r.reference,
          r.accountId,
          r.governmentEntityId,
          r.countryId,
          r.currency,
          r.amount,
        );
      for (const r of facts.socialReservations)
        addRetained(
          r.reservationId,
          r.accountId,
          r.employerId,
          r.countryId,
          r.currency,
          r.amount,
        );
      const runs = readIndustryFirstDayWorkState(facts.workState).runs;
      for (const run of runs.filter(
        (run) =>
          run.source.countryId === c.countryId &&
          run.source.operatorId === site.operatorId,
      )) {
        if (run.terms.maximumExpense.currency !== expense.currency)
          invalid('EXACT_OPERATOR_RUN_CURRENCY_REQUIRED');
        // No cap release is inferred without a canonical run-cost settlement.
        retained = retained.add(
          Money.from(run.terms.maximumExpense.amount, expense.currency),
        );
      }
      if (
        positions[0]!.netDebitBalance
          .subtract(retained)
          .amount.lessThan(expense.amount)
      )
        invalid('SCHEDULE_EXCEEDS_CURRENT_UNCOMMITTED_OPERATOR_FUNDS');
      const prepared = prepareIndustryRunScheduleFrame(
        { state: facts.workState, command: c, head, observedAtReal: at },
        sha,
      );
      const binding = Object.freeze({
        schemaVersion: 'postwar-industry-run-current-binding-v1',
        commandFingerprint: c.fingerprint,
        observedAtReal: at,
        head,
        seedPins: facts.seedPins,
        sourceRef: facts.firstdayOriginal.sourceRef,
        sourceRawSha256: facts.firstdayOriginal.rawSha256,
        pageChainFingerprint: facts.pageChainFingerprint,
        siteFingerprint: hash(site),
        financialFingerprint: hash(facts.financial),
        retainedObligationsFingerprint: hash({
          funding: base.funding,
          budget: facts.budgetEncumbrances,
          social: facts.socialReservations,
          paidReleases: facts.wageState?.reservationReleases ?? [],
          runs: runs.map((r) => ({
            runId: r.terms.runId,
            cap: r.terms.maximumExpense,
            operator: r.source.operatorId,
            country: r.source.countryId,
          })),
        }),
        authorizationTeamId: text(r.team_id),
        authorizationVersion: text(r.authorization_version),
      });
      return {
        frame: prepared.frame,
        binding,
        head,
        commitAssertion: createWorldWriterCommitAssertion(
          lease,
          head.worldVersion,
        ),
      };
    } finally {
      releasePostwarIndustryRunStateContext(context);
    }
  }
  const port: Readonly<IndustryRunSourceCommitProtectionPort> = Object.freeze({
    async assertCurrentFrom(
      tx: SqlExecutor,
      request: Readonly<IndustryRunSourceCommitRequest>,
    ) {
      if (
        !live() ||
        active.has(tx) ||
        request.phase !== 'BEFORE_EVENTS' ||
        request.purpose !== INDUSTRY_RUN_SOURCE_PURPOSE ||
        request.financialPostingBatches.length ||
        request.inventoryPostings.length
      )
        invalid('FIXED_NONREENTRANT_RUN_CUTOFF_REQUIRED');
      active.add(tx);
      try {
        await authorize(request.command, request.commitAuthorization);
        const fresh = await derive(tx, request.command, request.observedAtReal);
        if (
          !same(fresh.head, request.currentHead) ||
          !same(fresh.frame.transition, request.transition) ||
          !same(fresh.binding, request.readBinding) ||
          fresh.binding.authorizationTeamId !==
            request.commitAuthorization!.teamId ||
          fresh.binding.authorizationVersion !==
            request.commitAuthorization!.authorizationVersion
        )
          invalid('CURRENT_RUN_SOURCE_OR_EFFECT_CHANGED');
        return Object.freeze({
          status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
          purpose: INDUSTRY_RUN_SOURCE_PURPOSE,
          commandFingerprint: request.command.fingerprint,
          currentHead: request.currentHead,
          readBindingFingerprint: hash(fresh.binding),
          protectionMode: 'HELD_SOURCE_GUARDS',
        });
      } finally {
        active.delete(tx);
      }
    },
  });
  guards.set(port, live);
  const factory: Readonly<AtomicTransitionCandidateFactory> = Object.freeze({
    async prepare(
      input: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ): Promise<AtomicTransitionDraft> {
      return track(async () => {
        await authorize(input.command, input.commitAuthorization);
        const fresh = await config.database.transaction((tx) =>
          derive(tx, input.command, input.observedAtReal),
        );
        return Object.freeze({
          transition: fresh.frame.transition,
          inventoryPostings: [],
          financialPostingBatches: [],
          receipt: fresh.frame.receipt,
          outboxMessages: [],
          currentMaterializations: [],
          authorityKind: 'DISCRETIONARY_USER',
          commitAssertion: fresh.commitAssertion,
          observedAtReal: input.observedAtReal,
          officeOperatingSourceReadBinding: fresh.binding,
        });
      });
    },
  });
  const runtime: Readonly<PostwarIndustryRunRuntime> = Object.freeze({
    worldId: world,
    database: config.database,
    candidateFactory: factory,
    sourceCommitProtectionPort: port,
    assertSourceBeforeClaim: (c: CanonicalCommand, at: string) =>
      track(async () => {
        await config.database.transaction((tx) => derive(tx, c, at));
      }),
    async close() {
      closed = true;
      await Promise.allSettled([...pending]);
    },
  });
  runtimes.set(runtime, live);
  return runtime;
}
