/** Fixed Industry command contract. Reuses the existing production kernel;
 * neither the parser nor calculation creates work, deliveries or permission. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import {
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  bindAuthoritativeTransition,
  type AuthoritativeTransition,
} from './receipt.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import {
  isValidatedProductionPosting,
  createProductionConsumptionPosting,
  productionConsumptionEventPayload,
  PRODUCTION_SETTLED_EVENT_TYPE,
  type InventoryProductionPosting,
} from '../inventory/production-consumption-posting.js';
import { PRODUCTION_WATER_CONSUMED_EVENT } from '../inventory/production-water-consumption.js';
export const INDUSTRY_PRODUCTION_COMMAND =
  'CORE_INDUSTRY_PRODUCTION_V1' as const;
export const INDUSTRY_PRODUCTION_CAPABILITY = 'INDUSTRY_PRODUCTION' as const;
export interface IndustryProductionIntent {
  readonly facilityId: string;
  readonly runId: string;
}
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Industry production command: ' + s,
  );
}
export function parseIndustryProductionIntent(
  command: CanonicalCommand,
  sha: Sha256Hex,
): Readonly<IndustryProductionIntent> {
  const c = validateCanonicalCommand(command, sha);
  if (
    c.commandType !== INDUSTRY_PRODUCTION_COMMAND ||
    c.officeId !== 'INDUSTRY' ||
    c.expectedWorldVersion === null
  )
    invalid('FIXED_INDUSTRY_COMMAND_SCOPE_REQUIRED');
  const body = JSON.parse(c.canonicalPayload) as Record<string, unknown>;
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    !Object.hasOwn(body, 'facilityId') ||
    !Object.hasOwn(body, 'runId') ||
    ![body.facilityId, body.runId].every(
      (v) =>
        typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(v),
    )
  )
    invalid('EXACT_FACILITY_AND_RUN_REFERENCES_REQUIRED');
  return Object.freeze({
    facilityId: String(body.facilityId),
    runId: String(body.runId),
  });
}
/** Calculation identity only. Source admission, OP mandate and current-use
 * eligibility MUST be checked by the held Worker/Atomic source guard. */
export function assertIndustryProductionCommandCalculation(
  input: Readonly<{
    command: CanonicalCommand;
    transition: AuthoritativeTransition;
    posting: InventoryProductionPosting;
  }>,
  sha: Sha256Hex,
): void {
  const intent = parseIndustryProductionIntent(input.command, sha),
    { command, transition, posting } = input;
  if (
    !isValidatedProductionPosting(posting) ||
    posting.evidence.runId !== intent.runId ||
    posting.evidence.operating.payload.facilityRef !== intent.facilityId ||
    command.worldId !== posting.worldId ||
    command.countryId !== posting.evidence.output.countryId ||
    command.expectedWorldVersion !== transition.worldVersionBefore ||
    transition.events[0]?.eventType !== PRODUCTION_SETTLED_EVENT_TYPE ||
    transition.events[0].canonicalPayload !==
      canonicalSerialize(productionConsumptionEventPayload(posting.evidence)) ||
    (transition.events.length !== 1 &&
      (transition.events.length !== 2 ||
        transition.events[1]?.eventType !== PRODUCTION_WATER_CONSUMED_EVENT))
  )
    invalid('EXACT_CORE_PRODUCTION_CALCULATION_REQUIRED');
  const rebuilt = createProductionConsumptionPosting(
    {
      command,
      transition,
      postingId: posting.postingId,
      evidence: posting.evidence,
    },
    sha,
  );
  if (
    canonicalSerialize(rebuilt) !== canonicalSerialize(posting) ||
    canonicalSerialize(
      bindAuthoritativeTransition({ command, transition }, sha),
    ) !== canonicalSerialize(posting.transitionBinding)
  )
    invalid('CORE_PRODUCTION_IDENTITY_MISMATCH');
}
