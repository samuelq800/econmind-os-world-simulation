// B16 isolated diagnostic only. No resolver factory, grant, writer or host entry.
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  isAuthorizedOfficeContext,
  reauthorizeOfficeCapability,
  type CanonicalCommand,
  type CommitAuthorizationProof,
} from '@econmind/core';
import { createTransactionCutoffAuthorizationGuard } from '../authoritative-execution.js';
import type { SqlExecutor } from '../persistence/sql-database.js';
import { inspectB16PermissionSourceCandidate } from './unknown2544-permission-source-candidate.js';

type CandidateInput = Parameters<typeof inspectB16PermissionSourceCandidate>[0];
type ConsumerObservation =
  | 'ACTUAL_BINDING_ABSENT'
  | 'CANDIDATE_REVOKED'
  | 'CONTEXT_NOT_SERVER_ISSUED'
  | 'CONTEXT_SCOPE_CHANGED'
  | 'CURRENT_AUTHORIZATION_DENIED'
  | 'COMMIT_INPUT_ABSENT'
  | 'COMMIT_SCOPE_CHANGED'
  | 'HEAD_ABSENT_OR_CHANGED'
  | 'ISOLATED_GUARD_RECHECKED_NOT_ORIGINAL_PERMISSION';

/** Connect original IDs to the existing parser, branded Core re-resolution and
 * fixed SQL cutoff reader for diagnostic acceptance. Even a successful probe
 * cannot establish real roster, entity ownership, source adoption or B16 truth.
 * No principal/context/proof is returned and no economic fact is written.
 * The caller owns the isolated transaction; this is not a commit operation.
 */
export async function inspectB16PermissionConsumer(input: {
  readonly candidate: CandidateInput;
  readonly issuedContext: unknown | null;
  readonly commitAttempt: Readonly<{
    command: CanonicalCommand;
    proof: CommitAuthorizationProof;
  }> | null;
  readonly transaction: SqlExecutor | null;
}) {
  const candidate = inspectB16PermissionSourceCandidate(input.candidate);
  const result = (consumerObservation: ConsumerObservation) =>
    Object.freeze({
      ...candidate,
      consumerObservation,
      actualRosterBinding: null,
      actualEntityScopeBinding: null,
      authoritativeCommitPerformed: false as const,
      originalFieldClosure: false as const,
    });
  if (
    candidate.inspection === 'SOURCE_ABSENT' ||
    candidate.inspection === 'EXPECTED_SCOPE_ABSENT'
  )
    return result('ACTUAL_BINDING_ABSENT');
  if (candidate.inspection === 'CANDIDATE_REVOKED')
    return result('CANDIDATE_REVOKED');
  if (!isAuthorizedOfficeContext(input.issuedContext))
    return result('CONTEXT_NOT_SERVER_ISSUED');
  const expected = input.candidate.expected!;
  try {
    // Never trust intake's cached context. This calls its existing server-held
    // resolver; revision/team changes require a fresh attempt, not silent reuse.
    const current = await reauthorizeOfficeCapability(input.issuedContext);
    if (
      current.authSubject !== expected.authSubject ||
      current.worldId !== expected.worldId ||
      current.countryId !== candidate.countryId ||
      current.teamId !== expected.teamId ||
      current.officeId !== expected.officeId ||
      current.capability !== expected.capability ||
      current.authorizationVersion !== expected.authorizationRevision ||
      input.issuedContext.authorizationVersion !==
        current.authorizationVersion ||
      input.issuedContext.teamId !== current.teamId
    )
      return result('CONTEXT_SCOPE_CHANGED');
    if (input.transaction === null || input.commitAttempt === null)
      return result('COMMIT_INPUT_ABSENT');
    const { command, proof } = input.commitAttempt;
    if (
      command.worldId !== current.worldId ||
      command.countryId !== current.countryId ||
      command.authSubject !== current.authSubject ||
      command.officeId !== current.officeId ||
      command.expectedWorldVersion !== expected.worldVersion ||
      proof.worldId !== current.worldId ||
      proof.countryId !== current.countryId ||
      proof.authSubject !== current.authSubject ||
      proof.officeId !== current.officeId ||
      proof.teamId !== current.teamId ||
      proof.capability !== current.capability ||
      proof.authorizationVersion !== current.authorizationVersion
    )
      return result('COMMIT_SCOPE_CHANGED');
    const head = await input.transaction.query<{ world_version: string }>(
      'select world_version::text as world_version from world_v2.world_head where world_id=$1 for share',
      [current.worldId],
    );
    if (
      head.rows.length !== 1 ||
      head.rows[0]!.world_version !== expected.worldVersion
    )
      return result('HEAD_ABSENT_OR_CHANGED');
    // Permanently uses the existing server-held current_commit_authorization
    // SQL reader, not a caller-supplied always-authorizing guard/callback.
    await createTransactionCutoffAuthorizationGuard().assertCurrent(
      input.transaction,
      {
        command,
        proof,
        authorityKind: 'DISCRETIONARY_USER',
        expected: 'AUTHORIZED',
      },
    );
    return result('ISOLATED_GUARD_RECHECKED_NOT_ORIGINAL_PERMISSION');
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.code === DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED
    )
      return result('CURRENT_AUTHORIZATION_DENIED');
    throw error; // SQL/transport/implementation failures are not denials or PASS.
  }
}
