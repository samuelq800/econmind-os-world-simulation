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

interface CurrentCommitAuthorization {
  readonly authSubject: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly capability: string;
  readonly teamId: string;
  readonly authorizationVersion: string;
}

function denied(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED, message);
}

interface CurrentCommitAuthorizationRow {
  readonly auth_subject: unknown;
  readonly authorization_version: unknown;
  readonly capability: unknown;
  readonly country_id: unknown;
  readonly office_id: unknown;
  readonly team_id: unknown;
  readonly world_id: unknown;
}

/**
 * The only V09 production authorization reader. Its rows are a server-owned
 * current-authorization projection; a missing row is denial, never a fallback
 * to caller-provided resolver or intake evidence. Every read uses the
 * repository's already-open authoritative transaction.
 */
class SqlServerHeldCommitAuthorizationSource {
  async readCurrentAuthorization(
    transaction: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      proof: CommitAuthorizationProof;
    }>,
  ): Promise<Readonly<CurrentCommitAuthorization> | null> {
    const result = await transaction.query<CurrentCommitAuthorizationRow>(
      `select auth_subject::text as auth_subject,
              world_id,
              country_id,
              office_id,
              capability,
              team_id,
              authorization_version
         from world_v2.current_commit_authorization
        where world_id = $1
          and auth_subject = $2::uuid
          and country_id = $3
          and office_id = $4
          and capability = $5
          and active
        for key share`,
      [
        input.command.worldId,
        input.proof.authSubject,
        input.command.countryId,
        input.proof.officeId,
        input.proof.capability,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    if (
      typeof row.auth_subject !== 'string' ||
      typeof row.world_id !== 'string' ||
      typeof row.country_id !== 'string' ||
      typeof row.office_id !== 'string' ||
      typeof row.capability !== 'string' ||
      typeof row.team_id !== 'string' ||
      typeof row.authorization_version !== 'string'
    ) {
      denied('Server-held authorization projection has malformed current evidence');
    }
    return Object.freeze({
      authSubject: row.auth_subject,
      worldId: row.world_id,
      countryId: row.country_id,
      officeId: row.office_id,
      capability: row.capability,
      teamId: row.team_id,
      authorizationVersion: row.authorization_version,
    });
  }

  async assertStillRevoked(
    transaction: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      receipt: FinalCommandReceipt;
    }>,
  ): Promise<void> {
    const result = await transaction.query(
      `select 1
         from world_v2.current_commit_authorization
        where world_id = $1
          and auth_subject = $2::uuid
          and country_id = $3
          and office_id is not distinct from $4
          and active
        for key share`,
      [
        input.command.worldId,
        input.command.authSubject,
        input.command.countryId,
        input.command.officeId,
      ],
    );
    if (result.rowCount !== 0) {
      denied(
        'A current server-held authorization exists; revoked receipt cannot be finalized',
      );
    }
  }
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
 * ADR-20 transaction-cutoff guard. It is permanently bound to the Worker SQL
 * authority projection; callers cannot substitute an always-authorizing source.
 */
export function createTransactionCutoffAuthorizationGuard(): AtomicCommitAuthorizationGuard {
  const source = new SqlServerHeldCommitAuthorizationSource();
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
  readonly candidateFactory: AtomicTransitionCandidateFactory;
}): Readonly<AuthoritativeWorkerExecution> {
  const repository = new AtomicTransitionRepository({
    database: input.database,
    authorizationGuard: createTransactionCutoffAuthorizationGuard(),
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
