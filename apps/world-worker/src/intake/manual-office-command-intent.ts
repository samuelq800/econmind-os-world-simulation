import { createHash } from 'node:crypto';
import {
  COMMAND_SCHEMA_VERSION,
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CENTRAL_BANK_OMO_COMMAND,
  DomainError,
  DOMAIN_ERROR_CODES,
  actorId,
  parseCanonicalCommand,
  parseCaptainPoliticalCapitalAllocation,
  parseCentralBankOmoIntent,
  parseSocialEmploymentServiceCommand,
  type CanonicalCommand,
} from '@econmind/core';
import type { ManualOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export interface StoredManualOfficeCommand {
  worldId: string;
  commandId: string;
  idempotencyKey: string;
  commandType: string;
  schemaVersion: string;
  canonicalPayload: string;
  payloadHash: string;
  fingerprint: string;
  actorId: string;
  authSubject: string;
  countryId: string;
  officeId: string;
  expectedWorldVersion: string;
  simTime: string;
  correlationId: string;
  submittedAtReal: Date | string;
}
function conflict(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    'Command identity already binds a different intent',
  );
}
/** Original intake's canonical decoder; no IO, time, permission or runtime issuance. */
export function decodeStoredManualOfficeCommand(
  records: readonly StoredManualOfficeCommand[],
  request: ManualOfficeCommandRequestDto,
): CanonicalCommand | undefined {
  if (records.length > 1) conflict();
  const stored = records[0];
  if (!stored) return undefined;
  if (
    stored.commandId !== request.commandId ||
    stored.idempotencyKey !== request.idempotencyKey
  )
    conflict();
  const { fingerprint, payloadHash, canonicalPayload, ...fields } = stored;
  const original = parseCanonicalCommand(
    {
      ...fields,
      submittedAtReal:
        stored.submittedAtReal instanceof Date
          ? stored.submittedAtReal.toISOString()
          : stored.submittedAtReal,
      payload: JSON.parse(canonicalPayload) as unknown,
    },
    sha,
  );
  if (
    original.fingerprint !== fingerprint ||
    original.payloadHash !== payloadHash ||
    original.canonicalPayload !== canonicalPayload
  )
    conflict();
  return original;
}
/** Same strict canonical/family parser used for fresh intake and read-only recovery. */
export function buildManualOfficeCommandIntent(input: {
  request: ManualOfficeCommandRequestDto;
  countryId: string;
  officeId: string | null;
  authSubject: string;
  actor: string;
  simTime: string;
  submittedAtReal: string;
  correlationId: string;
}): CanonicalCommand {
  const request = input.request;
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: request.commandType,
      worldId: request.worldId,
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      countryId: input.countryId,
      officeId: input.officeId,
      actorId: actorId(input.actor),
      authSubject: input.authSubject,
      expectedWorldVersion: request.expectedWorldVersion,
      simTime: input.simTime,
      submittedAtReal: input.submittedAtReal,
      correlationId: input.correlationId,
      payload: request.payload,
    },
    sha,
  );
  if (command.commandType === CAPTAIN_POLITICAL_CAPITAL_COMMAND)
    parseCaptainPoliticalCapitalAllocation(command, sha);
  else if (command.commandType === CENTRAL_BANK_OMO_COMMAND)
    parseCentralBankOmoIntent(command, sha);
  else if (parseSocialEmploymentServiceCommand(command, sha).kind !== 'PLAN')
    throw new DomainError(
      DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID,
      'Invalid manual Office request',
    );
  return command;
}
