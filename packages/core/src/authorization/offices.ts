import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import type { CountryId, OfficeId, TeamId, UserId, WorldId } from '../ids.js';
import { officeId } from '../ids.js';
import type { AuthenticatedPrincipal } from './identity.js';

export const OFFICE_DEFINITIONS = Object.freeze({
  CAPTAIN: Object.freeze({
    displayName: 'Country Captain / Head of Government',
    capabilities: Object.freeze([
      'CAPTAIN_STRATEGY',
      'CAPTAIN_CABINET',
      'CAPTAIN_CRISIS_COORDINATION',
    ] as const),
  }),
  CENTRAL_BANK: Object.freeze({
    displayName: 'Central Bank Governor',
    capabilities: Object.freeze([
      'CENTRAL_BANK_MONETARY_POLICY',
      'CENTRAL_BANK_BANKING_STABILITY',
      'CENTRAL_BANK_FX_RESERVES',
    ] as const),
  }),
  FINANCE: Object.freeze({
    displayName: 'Minister of Finance & Economy',
    capabilities: Object.freeze([
      'FINANCE_TREASURY',
      'FINANCE_BUDGET',
      'FINANCE_PUBLIC_DEBT',
    ] as const),
  }),
  INDUSTRY: Object.freeze({
    displayName: 'Minister of Industry, Technology & Resources',
    capabilities: Object.freeze([
      'INDUSTRY_PRODUCTION',
      'INDUSTRY_TECHNOLOGY',
      'INDUSTRY_RESOURCES',
    ] as const),
  }),
  SOCIAL: Object.freeze({
    displayName: 'Minister of Labour, Education & Social Development',
    capabilities: Object.freeze([
      'SOCIAL_LABOUR',
      'SOCIAL_EDUCATION',
      'SOCIAL_DEVELOPMENT',
    ] as const),
  }),
  TRADE: Object.freeze({
    displayName: 'Minister of Trade & Foreign Affairs',
    capabilities: Object.freeze([
      'TRADE_POLICY',
      'TRADE_CONTRACTS',
      'TRADE_FOREIGN_AFFAIRS',
    ] as const),
  }),
} as const);

export type CanonicalOfficeName = keyof typeof OFFICE_DEFINITIONS;
export type OfficeCapability =
  (typeof OFFICE_DEFINITIONS)[CanonicalOfficeName]['capabilities'][number];
export const OFFICE_APPROVAL_CAPABILITY = 'SIGN_OFFICE_APPROVAL' as const;
export type AuthorizationCapability =
  OfficeCapability | typeof OFFICE_APPROVAL_CAPABILITY;

export const CANONICAL_OFFICE_IDS = Object.freeze(
  Object.keys(OFFICE_DEFINITIONS).map((value) => officeId(value)),
);

export interface MembershipSnapshot {
  readonly authorizationVersion: string;
  readonly userId: UserId;
  readonly worldId: WorldId;
  readonly teamId: TeamId;
  readonly countryId: CountryId;
  readonly officeAssignments: readonly OfficeId[];
  readonly active: boolean;
  readonly suspended: boolean;
  readonly isWorldAdmin: boolean;
  readonly negotiationPartyIds: readonly string[];
}

export interface AuthorizationResolver {
  resolveCurrentMembership(
    principal: AuthenticatedPrincipal,
    worldId: WorldId,
  ): Promise<MembershipSnapshot | null>;
}

const authorizedOfficeContext: unique symbol = Symbol(
  'econmind.authorized-office-context',
);

export interface AuthorizedOfficeContext {
  readonly [authorizedOfficeContext]: true;
  readonly authorizationVersion: string;
  readonly userId: UserId;
  readonly worldId: WorldId;
  readonly teamId: TeamId;
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
  readonly capability: AuthorizationCapability;
}

export function isAuthorizedOfficeContext(
  value: unknown,
): value is AuthorizedOfficeContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    authorizedOfficeContext in value &&
    (value as Record<PropertyKey, unknown>)[authorizedOfficeContext] === true
  );
}

function deny(reason: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED, reason);
}

function isCanonicalOffice(value: string): value is CanonicalOfficeName {
  return Object.hasOwn(OFFICE_DEFINITIONS, value);
}

export async function authorizeOfficeCapability(input: {
  readonly principal: AuthenticatedPrincipal | null;
  readonly resolver: AuthorizationResolver;
  readonly worldId: WorldId;
  readonly requestedCountryId: CountryId;
  readonly requestedOfficeId: OfficeId;
  readonly capability: AuthorizationCapability;
}): Promise<AuthorizedOfficeContext> {
  if (!input.principal) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHENTICATION_REQUIRED,
      'An authenticated principal is required',
    );
  }
  const membership = await input.resolver.resolveCurrentMembership(
    input.principal,
    input.worldId,
  );
  if (!membership) deny('No current World membership');
  if (membership.userId !== input.principal.userId)
    deny('Membership belongs to another user');
  if (membership.worldId !== input.worldId)
    deny('Membership belongs to another World');
  if (!membership.active || membership.suspended)
    deny('Membership is inactive or suspended');
  if (membership.countryId !== input.requestedCountryId)
    deny('Client country does not match current membership');
  if (!membership.officeAssignments.includes(input.requestedOfficeId))
    deny('Requested Office is not currently assigned');
  if (!isCanonicalOffice(input.requestedOfficeId)) deny('Unknown Office');
  const canonicalOffice = input.requestedOfficeId as CanonicalOfficeName;
  if (
    input.capability !== OFFICE_APPROVAL_CAPABILITY &&
    !OFFICE_DEFINITIONS[canonicalOffice].capabilities.includes(
      input.capability as never,
    )
  ) {
    deny('Capability belongs to a different Office');
  }
  return Object.freeze({
    [authorizedOfficeContext]: true as const,
    authorizationVersion: membership.authorizationVersion,
    userId: membership.userId,
    worldId: membership.worldId,
    teamId: membership.teamId,
    countryId: membership.countryId,
    officeId: input.requestedOfficeId,
    capability: input.capability,
  });
}
