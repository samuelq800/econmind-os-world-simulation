import {
  DOMAIN_ERROR_CODES,
  DomainError,
  processQueuedCommand,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type FinalCommandReceipt,
  type QueueAuthorityKind,
  type Sha256Hex,
  type SimTime,
} from '@econmind/core';

import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
  type AtomicCommitAuthorizationGuard,
  type AtomicTransitionCandidateFactory,
} from './persistence/atomic-transition-repository.js';
import type { SqlDatabase, SqlExecutor } from './persistence/sql-database.js';

export interface CurrentCommitAuthorization {
  readonly authSubject: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly capability: string;
  readonly teamId: string;
  readonly authorizationVersion: string;
}

/**
 * Adapter for the already-authoritative Office/assignment/revocation service.
 * Implementations must use the supplied transaction's connection (or its
 * transaction-bound authorization view), never client-held intake evidence.
 */
export interface ServerHeldCommitAuthorizationSource {
  readCurrentAuthorization(
    transaction: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      proof: CommitAuthorizationProof;
    }>,
  ): Promise<Readonly<CurrentCommitAuthorization> | null>;
  assertStillRevoked(
    transaction: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      receipt: FinalCommandReceipt;
    }>,
  ): Promise<void>;
}

function denied(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED, message);
}

function matchesProof(
  current: CurrentCommitAuthorization,
  proof: CommitAuthorizationProof,
): boolean {
  return (
    current.authSubject === proof.authSubject &&
    current.worldId === proof.worldId &&
    current.countryId === proof.countryId &&
    current.officeId === proof.officeId &&
    current.capability === proof.capability &&
    current.teamId === proof.teamId &&
    current.authorizationVersion === proof.authorizationVersion
  );
}

/**
 * ADR-20 transaction-cutoff guard. The source is required at composition time:
 * there is intentionally no process-local default or client-provided fallback.
 */
export function createTransactionCutoffAuthorizationGuard(
  source: ServerHeldCommitAuthorizationSource,
): AtomicCommitAuthorizationGuard {
  const guard: AtomicCommitAuthorizationGuard = {
    async assertCurrent(
      transaction: SqlExecutor,
      input: Parameters<AtomicCommitAuthorizationGuard['assertCurrent']>[1],
    ): Promise<void> {
      if (input.expected === 'NOT_APPLICABLE') {
        if (
          input.authorityKind !== 'VERSIONED_AUTOMATIC' ||
          input.proof !== null ||
          input.revokedReceipt !== undefined
        ) {
          denied('Automatic authority cannot carry discretionary evidence');
        }
        return;
      }
      if (input.authorityKind !== 'DISCRETIONARY_USER') {
        denied('Discretionary authority is required at the transaction cutoff');
      }
      if (input.expected === 'AUTHORIZED') {
        if (input.proof === null) {
          denied('Discretionary commit is missing its server-issued proof');
        }
        const current = await source.readCurrentAuthorization(transaction, {
          command: input.command,
          proof: input.proof,
        });
        if (current === null || !matchesProof(current, input.proof)) {
          denied(
            'Office assignment, capability, team or authorization revision changed before commit',
          );
        }
        return;
      }
      if (input.revokedReceipt === undefined) {
        denied('Authorization rejection lacks its durable receipt');
      }
      await source.assertStillRevoked(transaction, {
        command: input.command,
        receipt: input.revokedReceipt,
      });
    },
  };
  return Object.freeze(guard);
}

export interface AuthoritativeQueuedCommandInput {
  readonly command: CanonicalCommand;
  readonly authorityKind: QueueAuthorityKind;
  readonly commitSimTime: SimTime;
  readonly recordedAtReal: string;
  readonly requiredCapability?: CommitAuthorizationProof['capability'];
  readonly intakeAuthorization?: Parameters<
    typeof processQueuedCommand
  >[0]['intakeAuthorization'];
}

export interface AuthoritativeWorkerExecution {
  readonly repository: AtomicTransitionRepository;
  executeQueuedCommand(
    input: Readonly<AuthoritativeQueuedCommandInput>,
  ): ReturnType<typeof processQueuedCommand>;
}

/**
 * The sole Worker composition root for V09 authoritative execution. It owns
 * the repository and fixes its guard to the server-held transaction source.
 */
export function createAuthoritativeWorkerExecution(input: {
  readonly database: SqlDatabase;
  readonly workerId: string;
  readonly sha256Hex: Sha256Hex;
  readonly authorizationSource: ServerHeldCommitAuthorizationSource;
  readonly candidateFactory: AtomicTransitionCandidateFactory;
}): Readonly<AuthoritativeWorkerExecution> {
  const repository = new AtomicTransitionRepository({
    database: input.database,
    authorizationGuard: createTransactionCutoffAuthorizationGuard(
      input.authorizationSource,
    ),
    workerId: input.workerId,
    sha256Hex: input.sha256Hex,
  });
  return Object.freeze({
    repository,
    executeQueuedCommand: (
      commandInput: Readonly<AuthoritativeQueuedCommandInput>,
    ) =>
      processQueuedCommand({
        command: commandInput.command,
        authorityKind: commandInput.authorityKind,
        commitSimTime: commandInput.commitSimTime,
        recordedAtReal: commandInput.recordedAtReal,
        ...(commandInput.requiredCapability === undefined
          ? {}
          : { requiredCapability: commandInput.requiredCapability }),
        ...(commandInput.intakeAuthorization === undefined
          ? {}
          : { intakeAuthorization: commandInput.intakeAuthorization }),
        persistence: {
          readFinalReceipt: (command) => repository.readFinalReceipt(command),
          recordZeroEffectReceipt: (receipt) =>
            repository.recordZeroEffectReceipt(receipt),
          commitAuthorizedCommand: async ({ command, commitAuthorization }) => {
            const draft = await input.candidateFactory.prepare({
              command,
              commitAuthorization,
            });
            const committed = await repository.commit(
              prepareAtomicTransitionCandidate({
                command,
                commitAuthorization,
                draft,
                sha256Hex: input.sha256Hex,
              }),
            );
            return Object.freeze({
              receipt: committed.receipt,
              transition: committed.transition,
            });
          },
        },
      }),
  });
}
