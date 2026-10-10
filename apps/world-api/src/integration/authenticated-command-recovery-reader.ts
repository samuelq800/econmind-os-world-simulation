import type { Pool } from 'pg';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  type AuthenticatedCommandRecoveryRequestDto,
  type AuthenticatedCommandRecoveryResponseDto,
} from '@econmind/core';
import {
  decodeStoredManualOfficeCommand,
  buildManualOfficeCommandIntent,
  type StoredManualOfficeCommand,
} from '@econmind/world-worker/office-command-intake';
import { readAuthenticatedPostgresFinalCommandReceipt } from './postgres-final-receipt-reader.js';
import type { ServerVerifiedReadBinding } from './https-authenticated-read-composition.js';
import {
  createPostgresServerReadBindingSnapshotReader,
  type PostgresBindingSnapshotExecutor,
} from './postgres-server-read-binding.js';
import { parseSupabaseAuthSubject } from './identity.js';
import { trackRequestCompletion } from '../runtime-preparation/request-completion.js';
import type { ExplicitReadPreparationConfig } from '../runtime-preparation/explicit-read-preparation-config.js';
export type ManualRecoverySnapshotRequest = {
  verifiedSubject: ReturnType<typeof parseSupabaseAuthSubject>;
  worldId: string;
  signal: AbortSignal;
  recovery: Recovery;
  pins: ExplicitReadPreparationConfig['admittedWorldPins'];
  modelVersion: ExplicitReadPreparationConfig['modelVersion'];
};
type State = Extract<
  AuthenticatedCommandRecoveryResponseDto,
  { ok: true }
>['state'];
type Recovery = AuthenticatedCommandRecoveryRequestDto['request'];
function conflict(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    'Recovery intent mismatch',
  );
}
/** Fixed subject-bound READ ONLY operation; called only inside the snapshot runner.
 * No query text or authority comes from the wire. */
export async function readManualRecoveryFrom(
  executor: PostgresBindingSnapshotExecutor,
  request: Recovery,
  binding: ServerVerifiedReadBinding,
  signal: AbortSignal,
): Promise<State | null> {
  const dto = request.originalRequest.request;
  const records = await executor.query<StoredManualOfficeCommand>(
    `select world_id as "worldId",command_id as "commandId",idempotency_key as "idempotencyKey",
      command_type as "commandType",schema_version as "schemaVersion",canonical_payload as "canonicalPayload",
      payload_sha256 as "payloadHash",command_fingerprint as fingerprint,actor_id as "actorId",auth_subject::text as "authSubject",
      country_id as "countryId",office_id as "officeId",expected_world_version::text as "expectedWorldVersion",
      sim_time::text as "simTime",correlation_id as "correlationId",submitted_at_real as "submittedAtReal"
      from world_v2.command_submission where world_id=$1 and auth_subject=$4::uuid and (command_id=$2 or idempotency_key=$3) limit 2`,
    [
      request.worldId,
      request.commandId,
      request.idempotencyKey,
      binding.identity.authSubjectId,
    ],
  );
  const original = decodeStoredManualOfficeCommand(records.rows, dto);
  if (!original) return null;
  if (
    String(original.authSubject) !== binding.identity.authSubjectId ||
    original.countryId !== binding.identity.countryId ||
    original.officeId !== binding.identity.officeId ||
    original.worldId !== request.worldId ||
    original.idempotencyKey === null
  )
    conflict();
  const rebuilt = buildManualOfficeCommandIntent({
    request: dto,
    countryId: binding.identity.countryId,
    officeId: binding.identity.officeId,
    authSubject: binding.identity.authSubjectId,
    actor: original.actorId,
    simTime: original.simTime.toCanonicalValue(),
    submittedAtReal: original.submittedAtReal,
    correlationId: original.correlationId,
  });
  if (
    rebuilt.fingerprint !== original.fingerprint ||
    (request.knownCommandFingerprint !== undefined &&
      request.knownCommandFingerprint !== original.fingerprint)
  )
    conflict();
  const receipt = await readAuthenticatedPostgresFinalCommandReceipt({
    executor: {
      query: (r) => trackRequestCompletion(executor.query(r.text, r.values)),
    },
    identity: request,
    authSubject: parseSupabaseAuthSubject(binding.identity.authSubjectId),
    signal,
  });
  const queued = await executor.query<{
    queue_state: string;
    authority_kind: string;
    claimed_by: string | null;
    claim_fencing_token: string | null;
  }>(
    'select queue_state,authority_kind,claimed_by,claim_fencing_token::text from world_v2.command_queue where world_id=$1 and command_id=$2 limit 2',
    [request.worldId, request.commandId],
  );
  if (queued.rows.length !== 1) throw new Error('RECOVERY_QUEUE_INCOHERENT');
  const q = queued.rows[0]!;
  if (q.authority_kind !== 'DISCRETIONARY_USER')
    throw new Error('RECOVERY_QUEUE_INCOHERENT');
  if (receipt) {
    if (
      q.queue_state !== 'FINALIZED' ||
      receipt.commandFingerprint !== original.fingerprint
    )
      throw new Error('RECOVERY_FINAL_QUEUE_INCOHERENT');
    return Object.freeze({
      status: 'FINAL',
      commandType: dto.commandType,
      receipt,
    });
  }
  if (
    !['PENDING', 'CLAIMED'].includes(q.queue_state) ||
    (q.queue_state === 'PENDING' &&
      (q.claimed_by !== null || q.claim_fencing_token !== null)) ||
    (q.queue_state === 'CLAIMED' &&
      (!q.claimed_by || !/^[1-9]\d*$/u.test(q.claim_fencing_token ?? '')))
  )
    throw new Error('RECOVERY_QUEUE_INCOHERENT');
  return Object.freeze({
    status: q.queue_state === 'PENDING' ? 'QUEUED' : 'CLAIMED',
    commandType: dto.commandType,
    commandId: original.commandId,
    idempotencyKey: original.idempotencyKey,
    commandFingerprint: original.fingerprint,
  });
}
export function createAuthenticatedCommandRecoveryReader(input: {
  pool: Pick<Pool, 'connect'>;
  readerRole: string;
  authorizationPublisherRole: string;
}) {
  const snapshot = createPostgresServerReadBindingSnapshotReader(input);
  return Object.freeze({
    read: (request: ManualRecoverySnapshotRequest) =>
      snapshot.readManualRecovery(request, input.authorizationPublisherRole),
  });
}
