/** Pure consistency check over an already fully Core-replayed prefix. This
 * calculation is not an admission, publisher grant or execution authority. */
import { DomainError, DOMAIN_ERROR_CODES } from '@econmind/core';
import type {
  FinanceNativeBudgetCanonicalFrame,
  FinanceNativeBudgetMixedPrefixResult,
} from '@econmind/core/finance-budget-native';
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Mixed Social MATCH: ' + reason,
  );
}
const scope = (country: string, p: Record<string, unknown>) =>
  JSON.stringify([
    country,
    p.locationId,
    p.skill,
    p.positionId,
    p.servicePoolId,
    p.dueDayIndex,
  ]);
export function assertPostwarCurrentSocialMatchPlan(input: {
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly socialCountries: FinanceNativeBudgetMixedPrefixResult['socialCountries'];
  readonly countryId: string;
  readonly planCommandId: string;
  readonly requirePending: boolean;
}) {
  const found = input.frames.filter(
    (f) => f.command.commandId === input.planCommandId,
  );
  if (found.length !== 1) invalid('exact immutable PLAN required');
  const frame = found[0]!,
    command = frame.command;
  const intent = JSON.parse(command.canonicalPayload) as Record<
    string,
    unknown
  >;
  if (
    command.commandType !== 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1' ||
    command.officeId !== 'SOCIAL' ||
    command.countryId !== input.countryId ||
    frame.receipt.outcome !== 'COMMITTED' ||
    intent.schemaVersion !== 'social-employment-service-plan-v1' ||
    intent.dueDayIndex !== '0' ||
    command.simTime.ticks < 0n ||
    command.simTime.ticks >= 86400000n
  )
    invalid('canonical opening day-zero PLAN required');
  if (input.frames.some((f) => f.command.simTime.ticks > command.simTime.ticks))
    invalid('PLAN time precedes actual mixed prefix');
  const countries = input.socialCountries.filter(
    (c) => c.countryId === input.countryId,
  );
  if (countries.length !== 1) invalid('actual Core country required');
  const plans = countries[0]!.lifecycle.employment.plans.filter(
    (p) =>
      p.planCommandId === command.commandId &&
      p.planFingerprint === command.fingerprint,
  );
  if (plans.length !== 1) invalid('PLAN absent from current Core state');
  const current = plans[0]!;
  if (input.requirePending) {
    if (current.state !== 'PENDING' || current.settlementCommandId !== null)
      invalid('PLAN is already settled');
    if (
      input.frames.some(
        (f) =>
          f.command.commandType === 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1' &&
          f.command.countryId === command.countryId &&
          BigInt(f.transition.worldVersionAfter) >
            BigInt(frame.transition.worldVersionAfter) &&
          scope(
            f.command.countryId,
            JSON.parse(f.command.canonicalPayload) as Record<string, unknown>,
          ) === scope(command.countryId, intent),
      )
    )
      invalid('PLAN superseded by a later canonical PLAN in the same scope');
  }
  return Object.freeze({ frame, intent, state: current.state });
}
