/** Fixed server-only native source/cutoff integration. It publishes no source,
 * creates no pool/role, and admits no opening. Policy rows must be independently
 * published through the separately privileged controlled SQL function. */
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  createOutboxMessage,
  createWorldWriterCommitAssertion,
  parseWorldWriterLease,
  validateCanonicalCommand,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type AuthoritativeTransition,
  type Sha256Hex,
} from '@econmind/core';
import {
  prepareFinanceNativeBudgetTransition,
  evaluateFinanceNativeBudgetSource,
  replayFinanceNativeBudgetHistory,
  validateFinanceNativeBudgetPolicy,
  type FinanceNativeBudgetPolicy,
  type FinanceNativeBudgetSource,
} from '@econmind/core/finance-budget-native';
import { parseBudgetSourcePayload } from '@econmind/core/finance-budget-conditional-contract';
import { PostgresTransactionError } from './postgres-sql-database.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  readValidatedCanonicalLineageFrom,
} from './validated-canonical-lineage.js';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import { readPostwarFinancialOfficeOriginalsFromSeed } from '../preparation/postwar-financial-office-originals.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from './worker-authorization-sql.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type { AtomicTransitionCandidateFactory } from './atomic-transition-repository.js';
import {
  readPreparedFinanceBudgetSourceFrom,
  type PreparedFinanceBudgetSource,
} from './prepared-finance-budget-source.js';
import { replayPostwarSharedOfficePrefix } from './postwar-shared-office-prefix.js';
import {
  readPostgresFinanceBudgetCapacitySourceFrom,
  type PostgresFinanceBudgetCapacitySource,
} from './postgres-finance-budget-capacity-source.js';

export const FINANCE_BUDGET_NATIVE_SOURCE_COMMIT_PURPOSE =
  'FINANCE_NATIVE_BUDGET_SOURCE_COMMIT_V1' as const;
export const FINANCE_BUDGET_CUSTODY_PROPOSAL =
  'database/proposals/finance-budget-custody.sql';
export const FINANCE_BUDGET_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY = `select team_id,authorization_version from world_v2.current_commit_authorization
         where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id=$4
           and capability=$5 and active for share`;
export const FINANCE_BUDGET_SOURCE_LOCK_QUERY =
  'select * from world_v2.lock_finance_budget_policy($1,$2,$3,$4,$5,$6,$7::uuid)';
type Row = Record<string, unknown>;
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
function invalid(code: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `FINANCE_NATIVE_CUSTODY:${code}`,
  );
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('EXACT_ORIGINAL_METADATA_REQUIRED');
  return v;
}
export interface FinanceBudgetNativeCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof FINANCE_BUDGET_NATIVE_SOURCE_COMMIT_PURPOSE;
  readonly command: CanonicalCommand;
  readonly commitAuthorization: CommitAuthorizationProof | null;
  readonly transition: AuthoritativeTransition;
  readonly currentHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
}
export interface FinanceBudgetNativeCommitGuard {
  assertCurrentFrom(
    tx: SqlExecutor,
    input: FinanceBudgetNativeCommitRequest,
  ): Promise<
    Readonly<{
      status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
      purpose: typeof FINANCE_BUDGET_NATIVE_SOURCE_COMMIT_PURPOSE;
      commandFingerprint: string;
      currentHead: Readonly<{ worldVersion: string; eventSequence: string }>;
      readBindingFingerprint: string;
      protectionMode: 'HELD_SOURCE_GUARDS';
    }>
  >;
  assertHeldSourceCurrentFrom(
    tx: SqlExecutor,
    input: {
      readonly command: CanonicalCommand;
      readonly observedAtReal: string;
    },
  ): Promise<void>;
}
const guards = new WeakSet<object>();
export function isFinanceBudgetNativeCommitGuard(
  v: unknown,
): v is FinanceBudgetNativeCommitGuard {
  return !!v && typeof v === 'object' && guards.has(v);
}
export function createPostgresFinanceBudgetNativeRuntime(config: {
  readonly database: SqlDatabase;
  readonly workerId: string;
  readonly sha256Hex: Sha256Hex;
  readonly preparedSource?: PreparedFinanceBudgetSource;
  readonly capacitySource?: PostgresFinanceBudgetCapacitySource;
}) {
  if (!/^[A-Z][A-Z0-9_]*$/u.test(config.workerId))
    invalid('FIXED_WORKER_REQUIRED');
  const lineage = new DurableV08LedgerLineageReader(config);
  const held = new WeakMap<
    SqlExecutor,
    { commandId: string; policyRow: string }
  >();
  async function lock(
    tx: SqlExecutor,
    command: CanonicalCommand,
    observedAtReal: string,
  ) {
    validateCanonicalCommand(command, config.sha256Hex);
    if (
      command.officeId !== 'FINANCE' ||
      command.commandType !== 'CORE_FINANCE_BUDGET_APPROPRIATION_V1'
    )
      invalid('FINANCE_BUDGET_FAMILY_REQUIRED');
    const p = parseBudgetSourcePayload(JSON.parse(command.canonicalPayload));
    const result = await tx
      .query<Row>(FINANCE_BUDGET_SOURCE_LOCK_QUERY, [
        command.worldId,
        command.countryId,
        p.scope.envelopeRef,
        p.scope.effectivePeriodRef,
        config.workerId,
        observedAtReal,
        command.authSubject,
      ])
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          'message' in error &&
          ['23503', '42501'].includes(String(error.code)) &&
          /^BUDGET_[A-Z_]+$/u.test(String(error.message))
        )
          invalid(String(error.message));
        throw error;
      });
    if (result.rows.length !== 1)
      invalid('ADOPTED_POLICY_AND_ACTUAL_WRITER_REQUIRED');
    const row = result.rows[0]!;
    const bytes = text(row.policy_text),
      policy = JSON.parse(bytes) as FinanceNativeBudgetPolicy;
    if (
      canonicalSerialize(policy) !== bytes ||
      sha(bytes) !== row.policy_sha256
    )
      invalid('CANONICAL_ORIGINAL_POLICY_HASH_MISMATCH');
    validateFinanceNativeBudgetPolicy(policy);
    if (
      policy.worldId !== command.worldId ||
      policy.countryId !== command.countryId ||
      policy.envelopeRef !== p.scope.envelopeRef ||
      policy.effectivePeriodRef !== p.scope.effectivePeriodRef
    )
      invalid('SOURCE_POLICY_SCOPE_MISMATCH');
    const lease = parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: command.worldId,
      holderId: config.workerId,
      fencingToken: text(row.fencing_token),
      acquiredAtReal: text(row.acquired_at_real),
      renewedAtReal: text(row.renewed_at_real),
      expiresAtReal: text(row.lease_expires_at_real),
    });
    return { row, policy, lease };
  }
  async function sourceFrom<Result>(
    tx: SqlExecutor,
    command: CanonicalCommand,
    observedAtReal: string,
    consume: (
      source: FinanceNativeBudgetSource,
      lease: ReturnType<typeof parseWorldWriterLease>,
      row: Row,
    ) => Promise<Result>,
  ) {
    const original = await lock(tx, command, observedAtReal);
    if (config.capacitySource) {
      if (config.preparedSource) invalid('ONE_EXACT_SOURCE_MODE_REQUIRED');
      const source = await readPostgresFinanceBudgetCapacitySourceFrom({
        source: config.capacitySource,
        executor: tx,
        database: config.database,
        command,
        policy: original.policy,
        sourceRow: original.row,
        workerId: config.workerId,
        observedAtReal,
      });
      const value = await consume(source, original.lease, original.row);
      const after = await lock(tx, command, observedAtReal);
      if (canonicalSerialize(after.row) !== canonicalSerialize(original.row))
        invalid('SOURCE_CHANGED_DURING_READ');
      return value;
    }
    if (config.preparedSource) {
      const source = await readPreparedFinanceBudgetSourceFrom({
        prepared: config.preparedSource,
        executor: tx,
        database: config.database,
        command,
        policy: original.policy,
        sourceRow: original.row,
        sha256Hex: config.sha256Hex,
      });
      const value = await consume(source, original.lease, original.row);
      const after = await lock(tx, command, observedAtReal);
      if (canonicalSerialize(after.row) !== canonicalSerialize(original.row))
        invalid('SOURCE_CHANGED_DURING_READ');
      return value;
    }
    return withValidatedCanonicalLineageFrom(
      { reader: lineage, executor: tx, worldId: command.worldId },
      async (view) => {
        const canonical = readValidatedCanonicalLineageFrom(tx, view),
          seed = canonical.seed;
        if (
          seed.seedId !== original.row.seed_id ||
          seed.fingerprint !== original.row.seed_fingerprint ||
          canonical.headWorldVersion !== command.expectedWorldVersion
        )
          invalid('ACTUAL_ADMITTED_CANONICAL_HEAD_REQUIRED');
        const originals = readPostwarFinancialOfficeOriginalsFromSeed(seed);
        const countries = originals.contract.countries.filter(
          (c) => c.countryId === command.countryId,
        );
        if (
          countries.length !== 1 ||
          countries[0]!.localCurrency !== original.policy.currency
        )
          invalid('ORIGINAL_COUNTRY_CURRENCY_MISMATCH');
        // Resolve government identity from the exact adopted source roster, never
        // an account name, account class alone, an R/A bucket or read projection.
        const financial = seed.sources.filter(
          (s) => s.sourceId === originals.financialSourceId,
        );
        if (financial.length !== 1)
          invalid('CANONICAL_FINANCIAL_SOURCE_REQUIRED');
        const raw = JSON.parse(financial[0]!.canonicalPayload) as {
          assembly: {
            countries: {
              countryId: string;
              roster: { government: string; centralBank: string };
            }[];
          };
        };
        const roster = raw.assembly.countries.filter(
          (c) => c.countryId === command.countryId,
        );
        if (
          roster.length !== 1 ||
          roster[0]!.roster.government !== original.policy.governmentEntityId
        )
          invalid('ACTUAL_GOVERNMENT_SOURCE_ROSTER_REQUIRED');
        const bank = roster[0]!.roster.centralBank;
        const originalAssets = seed.financialBatches
          .filter((b) => b.sourceId === originals.financialSourceId)
          .flatMap((b) => b.legs)
          .filter(
            (l) =>
              l.direction === 'DEBIT' &&
              l.account.countryId === command.countryId &&
              l.account.ownerId === original.policy.governmentEntityId &&
              l.account.counterpartyEntityId === bank &&
              l.account.currency === original.policy.currency &&
              l.account.accountClass === 'ASSET' &&
              l.account.claimId !== null,
          );
        if (originalAssets.length !== 1)
          invalid('EXACT_ADOPTED_TGA_CLAIM_REQUIRED');
        const asset = originalAssets[0]!,
          mirror = seed.financialBatches
            .flatMap((b) => b.legs)
            .filter((l) => l.legId === asset.counterpartLegId);
        if (
          mirror.length !== 1 ||
          mirror[0]!.counterpartLegId !== asset.legId ||
          mirror[0]!.direction !== 'CREDIT' ||
          mirror[0]!.account.ownerId !== bank ||
          mirror[0]!.account.counterpartyEntityId !== asset.account.ownerId ||
          mirror[0]!.account.claimId !== asset.account.claimId ||
          mirror[0]!.account.currency !== asset.account.currency ||
          mirror[0]!.account.accountClass !== 'LIABILITY' ||
          !mirror[0]!.amount.amount.equals(asset.amount.amount)
        )
          invalid('ORIGINAL_TGA_MIRROR_REQUIRED');
        const frames = canonical.transitions.map((t) => ({
          command: t.command,
          events: t.transition.events,
        }));
        const operating = readPostwarOperatingGenesisFromSeed(seed);
        const shared =
          operating.socialEmployment === null
            ? null
            : replayPostwarSharedOfficePrefix({
                lineage: canonical,
                document: operating.socialEmployment,
              });
        const state =
          shared?.budget.state ??
          replayFinanceNativeBudgetHistory(
            command.worldId,
            frames,
            config.sha256Hex,
          );
        if (
          state.worldVersion !== canonical.headWorldVersion ||
          state.eventSequence !== canonical.headEventSequence
        )
          invalid('COMPLETE_NATIVE_BUDGET_PREFIX_REQUIRED');
        const openingEncumbrances = operating.facts.funding
          .filter(
            (f) =>
              f.countryId === command.countryId &&
              f.accountId === asset.account.accountId &&
              f.payerEntityId === original.policy.governmentEntityId,
          )
          .map((f) => ({
            reference: f.fundingId,
            accountId: f.accountId,
            amount: f.ceilingAmount,
            currency: f.currency,
          }))
          .concat(
            (shared?.social.reservations ?? [])
              .filter(
                (r) =>
                  r.countryId === command.countryId &&
                  r.accountId === asset.account.accountId,
              )
              .map((r) => {
                if (
                  r.employerId !== original.policy.governmentEntityId ||
                  r.currency !== original.policy.currency
                )
                  invalid('ACTUAL_SOCIAL_RESERVATION_SCOPE_MISMATCH');
                return {
                  reference: r.reservationId,
                  accountId: r.accountId,
                  amount: r.amount,
                  currency: r.currency,
                };
              }),
          )
          .sort((a, b) =>
            a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0,
          );
        const source: FinanceNativeBudgetSource = {
          policy: original.policy,
          ...(shared === null ? {} : { mixedPrefixEvidence: shared.evidence }),
          binding: {
            seedRef: seed.seedId,
            seedFingerprint: seed.fingerprint,
            admissionRef: text(original.row.admission_ref),
            financialSourceId: originals.financialSourceId,
            originalsSHA256: 'sha256:' + sha(canonicalSerialize(originals)),
            policyHash: canonicalSha256(
              canonicalHashInput(original.policy),
              config.sha256Hex,
            ),
            treasuryAccountId: asset.account.accountId,
            treasuryClaimId: asset.account.claimId!,
            openingEncumbranceHash: canonicalSha256(
              canonicalHashInput(openingEncumbrances),
              config.sha256Hex,
            ),
          },
          openingEncumbrances,
          financialState: canonical.ledgers.financial,
          frames,
          worldVersion: canonical.headWorldVersion,
          eventSequence: canonical.headEventSequence,
        };
        const value = await consume(source, original.lease, original.row);
        const after = await lock(tx, command, observedAtReal);
        if (canonicalSerialize(after.row) !== canonicalSerialize(original.row))
          invalid('SOURCE_CHANGED_DURING_READ');
        return value;
      },
    );
  }
  function binding(
    command: CanonicalCommand,
    source: FinanceNativeBudgetSource,
    row: Row,
  ) {
    return {
      schemaVersion: 'finance-native-budget-source-read-binding-v1',
      purpose: FINANCE_BUDGET_NATIVE_SOURCE_COMMIT_PURPOSE,
      worldId: command.worldId,
      countryId: command.countryId,
      commandFingerprint: command.fingerprint,
      currentHead: {
        worldVersion: source.worldVersion,
        eventSequence: source.eventSequence,
      },
      seedRef: source.binding.seedRef,
      seedFingerprint: source.binding.seedFingerprint,
      admissionRef: source.binding.admissionRef,
      policyRef: text(row.policy_ref),
      policyHash: source.binding.policyHash,
      sourceBindingFingerprint: canonicalSha256(
        canonicalHashInput(source.binding),
        config.sha256Hex,
      ),
    };
  }
  const factory: AtomicTransitionCandidateFactory = {
    async prepare(input) {
      if (!input.commitAuthorization)
        invalid('COMMAND_BOUND_CURRENT_FINANCE_PROOF_REQUIRED');
      return config.database.transaction((tx) =>
        sourceFrom(
          tx,
          input.command,
          input.observedAtReal,
          async (source, lease, row) => {
            const result = await prepareFinanceNativeBudgetTransition({
              command: input.command,
              authorization: input.commitAuthorization!,
              source,
              recordedAtReal: input.observedAtReal,
              sha256Hex: config.sha256Hex,
            });
            return {
              transition: result.transition,
              receipt: result.receipt,
              inventoryPostings: [],
              financialPostingBatches: [],
              currentMaterializations: [],
              outboxMessages: [
                createOutboxMessage({
                  messageId: `OUTBOX_NATIVE_BUDGET_${input.command.fingerprint.slice(7).toUpperCase()}`,
                  worldId: input.command.worldId,
                  commandId: input.command.commandId,
                  eventId: result.transition.eventIds[0]!,
                  payload: {
                    schemaVersion: 'finance-native-budget-outbox-v1',
                    interpretation: result.interpretation,
                  },
                  payloadHash: canonicalSha256(
                    canonicalHashInput({
                      schemaVersion: 'finance-native-budget-outbox-v1',
                      interpretation: result.interpretation,
                    }),
                    config.sha256Hex,
                  ),
                  availableAtSimTime: input.command.simTime,
                }),
              ],
              officeOperatingSourceReadBinding: binding(
                input.command,
                source,
                row,
              ),
              authorityKind: 'DISCRETIONARY_USER' as const,
              commitAssertion: createWorldWriterCommitAssertion(
                lease,
                input.command.expectedWorldVersion!,
              ),
              observedAtReal: input.observedAtReal,
            };
          },
        ),
      );
    },
  };
  const commitGuard: FinanceBudgetNativeCommitGuard = Object.freeze({
    async assertCurrentFrom(
      tx: SqlExecutor,
      input: FinanceBudgetNativeCommitRequest,
    ) {
      if (
        input.phase !== 'BEFORE_EVENTS' ||
        input.purpose !== FINANCE_BUDGET_NATIVE_SOURCE_COMMIT_PURPOSE ||
        !input.commitAuthorization
      )
        invalid('CURRENT_FINANCE_PROOF_AND_CLOSED_SOURCE_PURPOSE_REQUIRED');
      return sourceFrom(
        tx,
        input.command,
        input.observedAtReal,
        async (source, _lease, row) => {
          const current = await prepareFinanceNativeBudgetTransition({
            command: input.command,
            authorization: input.commitAuthorization!,
            source,
            recordedAtReal: input.observedAtReal,
            sha256Hex: config.sha256Hex,
          });
          if (
            canonicalSerialize(current.transition) !==
            canonicalSerialize(input.transition)
          )
            invalid('CANDIDATE_DIFFERS_FROM_HELD_CANONICAL_SOURCE');
          const actualBinding = binding(input.command, source, row);
          if (
            canonicalSerialize(actualBinding) !==
              canonicalSerialize(input.readBinding) ||
            canonicalSerialize(actualBinding.currentHead) !==
              canonicalSerialize(input.currentHead)
          )
            invalid('EXACT_HELD_SOURCE_READ_BINDING_REQUIRED');
          held.set(tx, {
            commandId: input.command.commandId,
            policyRow: canonicalSerialize(row),
          });
          return {
            status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY' as const,
            purpose: FINANCE_BUDGET_NATIVE_SOURCE_COMMIT_PURPOSE,
            commandFingerprint: input.command.fingerprint,
            currentHead: input.currentHead,
            readBindingFingerprint: canonicalSha256(
              canonicalHashInput(actualBinding),
              config.sha256Hex,
            ),
            protectionMode: 'HELD_SOURCE_GUARDS' as const,
          };
        },
      );
    },
    async assertHeldSourceCurrentFrom(
      tx: SqlExecutor,
      input: Pick<
        FinanceBudgetNativeCommitRequest,
        'command' | 'observedAtReal'
      >,
    ) {
      const prior = held.get(tx);
      if (!prior || prior.commandId !== input.command.commandId)
        invalid('PRIOR_ACTUAL_SOURCE_CUTOFF_REQUIRED');
      const current = await lock(tx, input.command, input.observedAtReal);
      if (canonicalSerialize(current.row) !== prior.policyRow)
        invalid('HELD_SOURCE_REVOKED_OR_CHANGED');
    },
  });
  guards.add(commitGuard);
  return Object.freeze({
    factory,
    commitGuard,
    async assertSourceBeforeClaim(input: {
      command: CanonicalCommand;
      observedAtReal: string;
    }) {
      try {
        await config.database.transaction((tx) =>
          sourceFrom(
            tx,
            input.command,
            input.observedAtReal,
            async (source) => {
              evaluateFinanceNativeBudgetSource({
                command: input.command,
                source,
                sha256Hex: config.sha256Hex,
              });
            },
          ),
        );
      } catch (error) {
        if (
          error instanceof PostgresTransactionError &&
          error.outcome === 'ROLLED_BACK' &&
          error.cause instanceof DomainError
        )
          throw error.cause;
        throw error;
      }
    },
  });
}

/** Delegate ONLY the existing exact authorization cutoffs for FINANCE budget.
 * Every result and lock comes from SQL on this executor. Unknown statements or
 * other office scopes retain the original database behavior/privilege checks. */
export function createFinanceBudgetAuthorizationDatabase(
  database: SqlDatabase,
): SqlDatabase {
  const bind = (executor: SqlExecutor): SqlExecutor => ({
    async query<Row extends object>(
      statement: string,
      parameters: readonly unknown[] = [],
    ) {
      if (
        statement === FINANCE_BUDGET_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY &&
        parameters.length === 5 &&
        parameters[3] === 'FINANCE' &&
        parameters[4] === 'FINANCE_BUDGET'
      )
        return executor.query<Row>(
          'select team_id,authorization_version from world_v2.lock_finance_budget_current_authorization($1,$2::uuid,$3,$4,$5)',
          parameters,
        );
      if (
        statement === WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY &&
        parameters.length === 5 &&
        parameters[3] === 'FINANCE' &&
        parameters[4] === 'FINANCE_BUDGET'
      )
        return executor.query<Row>(
          'select * from world_v2.lock_finance_budget_current_authorization($1,$2::uuid,$3,$4,$5)',
          parameters,
        );
      if (
        statement === WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY &&
        parameters.length === 4 &&
        parameters[3] === 'FINANCE'
      )
        return executor.query<Row>(
          'select present as "?column?" from world_v2.lock_finance_budget_revoked_authorization($1,$2::uuid,$3,$4)',
          parameters,
        );
      return executor.query<Row>(statement, parameters);
    },
  });
  return Object.freeze({
    query: bind(database).query,
    transaction: <Result>(
      consume: (executor: SqlExecutor) => Promise<Result>,
    ) => database.transaction((executor) => consume(bind(executor))),
  });
}
