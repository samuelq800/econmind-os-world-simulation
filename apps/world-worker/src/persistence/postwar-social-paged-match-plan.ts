/** Consistency calculation over genuine cumulative Core replay DATA. The
 * publisher calls this only after consuming its transaction-bound snapshot;
 * this calculation itself issues no source, clock or publication authority. */
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalSerialize,
  parseCanonicalCommand,
  parseSocialEmploymentServiceCommand,
  type CanonicalCommand,
} from '@econmind/core';
import type { FinanceNativeBudgetMixedPrefixResult } from '@econmind/core/finance-budget-native';
import { createHash } from 'node:crypto';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Paged Social MATCH:' + s,
  );
}
function scope(c: CanonicalCommand) {
  const p = JSON.parse(c.canonicalPayload) as Record<string, unknown>;
  return canonicalSerialize([
    c.countryId,
    p.locationId,
    p.skill,
    p.positionId,
    p.servicePoolId,
    p.dueDayIndex,
  ]);
}
export function assertPostwarCurrentPagedSocialMatchPlan(input: {
  worldId: string;
  countryId: string;
  head: { worldVersion: string; eventSequence: string };
  latestCommandSimTime: bigint;
  socialCountries: FinanceNativeBudgetMixedPrefixResult['socialCountries'];
  planCommandId: string;
  requirePending: boolean;
}) {
  const countries = input.socialCountries.filter(
    (c) => c.countryId === input.countryId,
  );
  if (countries.length !== 1) invalid('EXACT_CORE_COUNTRY_REQUIRED');
  const employment = countries[0]!.lifecycle.employment,
    plans = employment.plans.filter(
      (p) => p.planCommandId === input.planCommandId,
    );
  if (plans.length !== 1) invalid('EXACT_CUMULATIVE_PLAN_ORIGINAL_REQUIRED');
  const p = plans[0]!,
    command = parseCanonicalCommand(
      JSON.parse(p.canonicalCommand) as unknown,
      sha,
    ),
    parsed = parseSocialEmploymentServiceCommand(command, sha);
  if (
    parsed.kind !== 'PLAN' ||
    command.commandId !== p.planCommandId ||
    command.fingerprint !== p.planFingerprint ||
    command.countryId !== input.countryId ||
    command.worldId !== input.worldId ||
    command.officeId !== 'SOCIAL' ||
    command.expectedWorldVersion === null ||
    BigInt(command.expectedWorldVersion) >= BigInt(input.head.worldVersion) ||
    command.simTime.ticks < 0n ||
    command.simTime.ticks >= 86400000n ||
    parsed.intent.dueDayIndex !== '0'
  )
    invalid('EXACT_DAY_ZERO_CORE_PLAN_REQUIRED');
  if (input.latestCommandSimTime > command.simTime.ticks)
    invalid('PLAN_TIME_PRECEDES_ACTUAL_COMPLETE_PREFIX');
  const operation = employment.appliedOperations.filter(
    (o) =>
      o.commandId === command.commandId &&
      o.commandFingerprint === command.fingerprint &&
      o.result.kind === 'PLAN',
  );
  if (operation.length !== 1) invalid('EXACT_CORE_PLAN_OPERATION_REQUIRED');
  if (input.requirePending) {
    if (p.state !== 'PENDING' || p.settlementCommandId !== null)
      invalid('PLAN_ALREADY_SETTLED');
    for (const other of employment.plans) {
      const c = parseCanonicalCommand(
        JSON.parse(other.canonicalCommand) as unknown,
        sha,
      );
      if (c.expectedWorldVersion === null) invalid('PLAN_HEAD_REQUIRED');
      if (
        BigInt(c.expectedWorldVersion) > BigInt(command.expectedWorldVersion) &&
        scope(c) === scope(command)
      )
        invalid('PLAN_SUPERSEDED_BY_LATER_SAME_SCOPE_PLAN');
    }
  }
  const settlement =
    p.settlementCommandId === null
      ? null
      : (employment.appliedOperations.find(
          (o) =>
            o.commandId === p.settlementCommandId &&
            o.result.kind === 'MATCH' &&
            o.result.planCommandId === command.commandId,
        ) ?? null);
  if (p.state === 'SETTLED' && !settlement)
    invalid('EXACT_SETTLEMENT_OPERATION_REQUIRED');
  return Object.freeze({
    command,
    intent: parsed.intent,
    state: p.state,
    settlement,
  });
}
