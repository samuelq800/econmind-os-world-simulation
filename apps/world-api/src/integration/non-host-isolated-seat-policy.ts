import {
  CANONICAL_OFFICE_IDS,
  authorizeProjection,
  countryId,
  worldId,
  type AuthenticatedPrincipal,
  type AuthorizationResolver,
} from '@econmind/core';

const ref = (s: string) =>
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(s) && s.length <= 256;
const time = (s: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString() === s;
export const ISOLATED_SEAT_TTL_REAL_MS = 86_400_000;
export const AUTONOMOUS_POLICY_NPC_ENABLED = false;

/** Server-read facts only. This policy publishes no membership, capability or
 * entitlement. Platform admin still needs a separate current Office approval
 * for every country/Office and the existing genuine authorization publisher. */
export interface IsolatedSeatPolicySource {
  readEligibleCountries(world: string): Promise<
    readonly {
      countryId: string;
      openingValidated: boolean;
      operationAccountsAndInventoryPresent: boolean;
    }[]
  >;
  readCurrentOfficeApproval(input: {
    worldId: string;
    authSubject: string;
    countryId: string;
    officeId: string;
  }): Promise<{ approvalRef: string; revoked: boolean } | null>;
}
export async function prepareNonHostIsolatedSeats(input: {
  readonly environment: 'TEST_ONLY_ISOLATED';
  readonly worldId: string;
  readonly principal: AuthenticatedPrincipal | null;
  readonly resolver: AuthorizationResolver;
  readonly source: IsolatedSeatPolicySource;
  readonly nowReal: string;
  readonly purpose: string;
}) {
  const deny = (field: string, code: string) =>
    Object.freeze({
      status: 'DENIED' as const,
      authorizationGranted: false as const,
      blocker: Object.freeze({ field, code }),
      seats: Object.freeze([]),
    });
  if (input.environment !== 'TEST_ONLY_ISOLATED')
    return deny('environment', 'ISOLATED_ENVIRONMENT_REQUIRED');
  if (!time(input.nowReal) || !ref(input.purpose))
    return deny('nowReal/purpose', 'INVALID_POLICY_INPUT');
  if (!input.principal)
    return deny('principal', 'VERIFIED_OWNER_ADMIN_MISSING');
  try {
    const world = worldId(input.worldId);
    if (
      !time(input.principal.token.issuedAt) ||
      Date.parse(input.principal.token.issuedAt) > Date.parse(input.nowReal) ||
      !time(input.principal.token.expiresAt) ||
      Date.parse(input.principal.token.expiresAt) <= Date.parse(input.nowReal)
    )
      return deny('principal.token.expiresAt', 'VERIFIED_SESSION_EXPIRED');
    await authorizeProjection({
      principal: input.principal,
      resolver: input.resolver,
      scope: { classification: 'ADMIN', worldId: world },
    });
    const rows = await input.source.readEligibleCountries(world);
    const ids = rows.map((r) => countryId(r.countryId));
    if (new Set(ids).size !== ids.length)
      return deny('eligibleCountries', 'AMBIGUOUS_COUNTRY_SOURCE');
    const selected = rows
      .filter(
        (r) =>
          r.openingValidated === true &&
          r.operationAccountsAndInventoryPresent === true,
      )
      .map((r) => r.countryId)
      .sort()
      .slice(0, 2);
    if (selected.length !== 2)
      return deny(
        'eligibleCountries',
        'TWO_ADMITTED_OPERABLE_COUNTRIES_MISSING',
      );
    const seats: Array<
      Readonly<{
        environment: 'TEST_ONLY_ISOLATED';
        worldId: string;
        countryId: string;
        officeId: string;
        actor: string;
        purpose: string;
        approvalRef: string;
        issuedAtReal: string;
        expiresAtReal: string;
      }>
    > = [];
    const approvalRefs = new Set<string>();
    for (const country of selected)
      for (const office of CANONICAL_OFFICE_IDS) {
        const approval = await input.source.readCurrentOfficeApproval({
          worldId: world,
          authSubject: input.principal.authSubject,
          countryId: country,
          officeId: office,
        });
        if (!approval || approval.revoked || !ref(approval.approvalRef))
          return deny(
            `OfficeApproval.${country}.${office}`,
            'CURRENT_SEPARATE_OFFICE_APPROVAL_MISSING',
          );
        if (approvalRefs.has(approval.approvalRef))
          return deny(
            `OfficeApproval.${country}.${office}`,
            'SEPARATE_OFFICE_APPROVAL_REF_REQUIRED',
          );
        approvalRefs.add(approval.approvalRef);
        seats.push(
          Object.freeze({
            environment: input.environment,
            worldId: world,
            countryId: country,
            officeId: office,
            actor: input.principal.authSubject,
            purpose: input.purpose,
            approvalRef: approval.approvalRef,
            issuedAtReal: input.nowReal,
            expiresAtReal: new Date(
              Date.parse(input.nowReal) + ISOLATED_SEAT_TTL_REAL_MS,
            ).toISOString(),
          }),
        );
      }
    // Explicit plan only: no SQL write, no Core Office context, no seatRef.
    return Object.freeze({
      status: 'PREPARED_NOT_GRANTED' as const,
      authorizationGranted: false as const,
      blocker: null,
      seats: Object.freeze(seats),
    });
  } catch {
    return deny(
      'currentOwnerAdmin/World',
      'SERVER_VERIFIED_ADMIN_OR_SOURCE_UNAVAILABLE',
    );
  }
}

/** Mandatory current revocation/expiry check before any later approved seat
 * publisher consumes a prepared row. Does not itself authorize an operation. */
export function isolatedSeatStillCurrent(input: {
  issuedAtReal: string;
  expiresAtReal: string;
  nowReal: string;
  revoked: boolean;
}): boolean {
  return (
    time(input.issuedAtReal) &&
    time(input.expiresAtReal) &&
    time(input.nowReal) &&
    input.revoked === false &&
    Date.parse(input.expiresAtReal) - Date.parse(input.issuedAtReal) ===
      ISOLATED_SEAT_TTL_REAL_MS &&
    input.nowReal >= input.issuedAtReal &&
    input.nowReal < input.expiresAtReal
  );
}

/** Additional restriction, never a grant: ACTIVE must already be lawful.
 * Only existing versioned obligations may reach existing SYSTEM settlement.
 * NPC policies, new orders and all ministerial approvals remain disabled. */
export function nonHostAutomaticExecutionAllowed(input: {
  phase: 'PREOPEN' | 'PAUSED' | 'ACTIVE';
  actor: 'NPC' | 'SYSTEM';
  operation:
    'EXISTING_RULE_SETTLEMENT' | 'NEW_POLICY' | 'NEW_ORDER' | 'APPROVAL';
  existingObligationRef: string | null;
  effectiveRuleVersion: string | null;
  causationRef: string | null;
}): boolean {
  return (
    input.phase === 'ACTIVE' &&
    input.actor === 'SYSTEM' &&
    input.operation === 'EXISTING_RULE_SETTLEMENT' &&
    [
      input.existingObligationRef,
      input.effectiveRuleVersion,
      input.causationRef,
    ].every((s) => typeof s === 'string' && ref(s))
  );
}
