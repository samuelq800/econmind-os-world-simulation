import { createHash } from 'node:crypto';
import {
  COMMAND_SCHEMA_VERSION,
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CENTRAL_BANK_OMO_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  parseSocialPositionOfferCreateIntent,
  DomainError,
  DOMAIN_ERROR_CODES,
  actorId,
  parseCanonicalCommand,
  parseCaptainPoliticalCapitalAllocation,
  parseCentralBankOmoIntent,
  parseSocialEmploymentServiceCommand,
  parseBudgetSourcePayload,
  validateCanonicalCommand,
  type CanonicalCommand,
} from '@econmind/core';
import {
  FINANCE_BUDGET_APPROPRIATION_COMMAND,
  type ManualOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
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
  if (original.commandType === FINANCE_BUDGET_APPROPRIATION_COMMAND)
    validateManualOfficeCommandIntent(original);
  return original;
}

function invalid(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID,
    'Invalid manual Office request',
  );
}

/** One family decoder shared by fresh intent, budget recovery and preflight.
 * Parsing is not authorization, source adoption or permission to queue/claim. */
export function validateManualOfficeCommandIntent(
  command: CanonicalCommand,
): void {
  validateCanonicalCommand(command, sha);
  switch (command.commandType) {
    case CAPTAIN_POLITICAL_CAPITAL_COMMAND:
      if (command.officeId !== 'CAPTAIN') invalid();
      parseCaptainPoliticalCapitalAllocation(command, sha);
      return;
    case CENTRAL_BANK_OMO_COMMAND:
      if (command.officeId !== 'CENTRAL_BANK') invalid();
      parseCentralBankOmoIntent(command, sha);
      return;
    case SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND:
      if (
        command.officeId !== 'SOCIAL' ||
        parseSocialEmploymentServiceCommand(command, sha).kind !== 'PLAN'
      )
        invalid();
      return;
    case SOCIAL_POSITION_OFFER_CREATE_COMMAND:
      if (
        command.officeId !== 'SOCIAL' ||
        command.expectedWorldVersion === null ||
        command.idempotencyKey === null
      )
        invalid();
      parseSocialPositionOfferCreateIntent(
        JSON.parse(command.canonicalPayload),
      );
      return;
    case FINANCE_BUDGET_APPROPRIATION_COMMAND: {
      if (
        command.officeId !== 'FINANCE' ||
        command.expectedWorldVersion === null ||
        command.idempotencyKey === null
      )
        invalid();
      // D owns this exact eight-key economic parser. Its private rejection
      // type is mapped to the existing transport error, never exposed as a
      // new public error contract or replaced by a permissive local parser.
      let payload: ReturnType<typeof parseBudgetSourcePayload>;
      try {
        payload = parseBudgetSourcePayload(
          JSON.parse(command.canonicalPayload),
        );
      } catch {
        invalid();
      }
      if (
        payload.scope.worldId !== command.worldId ||
        payload.scope.countryId !== command.countryId
      )
        invalid();
      return;
    }
    default:
      invalid();
  }
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
  if (
    request.countryId !== input.countryId ||
    request.officeId !== input.officeId
  )
    invalid();
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
  validateManualOfficeCommandIntent(command);
  return command;
}
