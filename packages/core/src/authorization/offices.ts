import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import type {
  AuthSubject,
  CountryId,
  OfficeId,
  ProposalId,
  TeamId,
  WorldId,
} from '../ids.js';
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

export const CANONICAL_OFFICE_IDS: readonly OfficeId[] = Object.freeze(
  Object.keys(OFFICE_DEFINITIONS).map((value) => officeId(value)),
);

export interface MembershipSnapshot {
  readonly authorizationVersion: string;
  readonly authSubject: AuthSubject;
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
  resolveCurrentIdentity(
    principal: AuthenticatedPrincipal,
  ): Promise<AuthSubject | null>;
  resolveCurrentMembership(
    principal: AuthenticatedPrincipal,
    worldId: WorldId,
  ): Promise<MembershipSnapshot | null>;
}

export interface ApprovalDecisionScope {
  readonly proposalId: ProposalId;
  readonly proposalVersion: string;
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly payloadFingerprint: string;
  readonly policyVersion: string;
  readonly requiredOffices: readonly OfficeId[];
}

declare const opaqueAuthorizedOfficeContext: unique symbol;

export interface AuthorizedOfficeContext {
  readonly [opaqueAuthorizedOfficeContext]: true;
  readonly authorizationVersion: string;
  readonly authSubject: AuthSubject;
  readonly worldId: WorldId;
  readonly teamId: TeamId;
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
  readonly capability: AuthorizationCapability;
}

interface AuthorizedOfficeMetadata {
  readonly context: AuthorizedOfficeContext;
  readonly principal: AuthenticatedPrincipal;
  readonly resolver: AuthorizationResolver;
  readonly decisionScope: ApprovalDecisionScope | null;
}

const authorizedOfficeMetadata = new WeakMap<
  object,
  AuthorizedOfficeMetadata
>();

export function isAuthorizedOfficeContext(
  value: unknown,
): value is AuthorizedOfficeContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    authorizedOfficeMetadata.has(value)
  );
}

function deny(reason: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED, reason);
}

function isCanonicalOffice(value: string): value is CanonicalOfficeName {
  return Object.hasOwn(OFFICE_DEFINITIONS, value);
}

function freezeDecisionScope(
  scope: ApprovalDecisionScope,
): ApprovalDecisionScope {
  return Object.freeze({
    ...scope,
    requiredOffices: Object.freeze([...scope.requiredOffices]),
  });
}

function sameDecisionScope(
  issued: ApprovalDecisionScope,
  presented: ApprovalDecisionScope,
): boolean {
  return (
    issued.proposalId === presented.proposalId &&
    issued.proposalVersion === presented.proposalVersion &&
    issued.worldId === presented.worldId &&
    issued.countryId === presented.countryId &&
    issued.payloadFingerprint === presented.payloadFingerprint &&
    issued.policyVersion === presented.policyVersion &&
    issued.requiredOffices.length === presented.requiredOffices.length &&
    issued.requiredOffices.every((office) =>
      presented.requiredOffices.includes(office),
    )
  );
}

async function resolveAuthorizedMembership(input: {
  readonly principal: AuthenticatedPrincipal;
  readonly resolver: AuthorizationResolver;
  readonly worldId: WorldId;
  readonly requestedCountryId: CountryId;
  readonly requestedOfficeId: OfficeId;
  readonly capability: AuthorizationCapability;
}): Promise<MembershipSnapshot> {
  const currentSubject = await input.resolver.resolveCurrentIdentity(
    input.principal,
  );
  if (currentSubject !== input.principal.authSubject) {
    deny('Authenticated identity is no longer current');
  }
  const membership = await input.resolver.resolveCurrentMembership(
    input.principal,
    input.worldId,
  );
  if (!membership) deny('No current World membership');
  if (membership.authSubject !== input.principal.authSubject)
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
  return membership;
}

export async function authorizeOfficeCapability(input: {
  readonly principal: AuthenticatedPrincipal | null;
  readonly resolver: AuthorizationResolver;
  readonly worldId: WorldId;
  readonly requestedCountryId: CountryId;
  readonly requestedOfficeId: OfficeId;
  readonly capability: AuthorizationCapability;
  readonly decisionScope?: ApprovalDecisionScope;
}): Promise<AuthorizedOfficeContext> {
  if (!input.principal) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHENTICATION_REQUIRED,
      'An authenticated principal is required',
    );
  }
  if (
    input.capability === OFFICE_APPROVAL_CAPABILITY &&
    input.decisionScope === undefined
  ) {
    deny('Approval authorization requires an explicit proposal scope');
  }
  if (
    input.decisionScope !== undefined &&
    (input.decisionScope.worldId !== input.worldId ||
      input.decisionScope.countryId !== input.requestedCountryId ||
      !input.decisionScope.requiredOffices.includes(input.requestedOfficeId))
  ) {
    deny('Approval scope conflicts with the requested authority');
  }
  const membership = await resolveAuthorizedMembership({
    principal: input.principal,
    resolver: input.resolver,
    worldId: input.worldId,
    requestedCountryId: input.requestedCountryId,
    requestedOfficeId: input.requestedOfficeId,
    capability: input.capability,
  });
  const context = Object.freeze({
    authorizationVersion: membership.authorizationVersion,
    authSubject: membership.authSubject,
    worldId: membership.worldId,
    teamId: membership.teamId,
    countryId: membership.countryId,
    officeId: input.requestedOfficeId,
    capability: input.capability,
  }) as AuthorizedOfficeContext;
  authorizedOfficeMetadata.set(context, {
    context,
    principal: input.principal,
    resolver: input.resolver,
    decisionScope:
      input.decisionScope === undefined
        ? null
        : freezeDecisionScope(input.decisionScope),
  });
  return context;
}

export async function reauthorizeOfficeDecision(
  value: unknown,
  proposal: ApprovalDecisionScope,
): Promise<AuthorizedOfficeContext> {
  if (!isAuthorizedOfficeContext(value)) {
    deny('Office context was not issued by server authorization');
  }
  const metadata = authorizedOfficeMetadata.get(value);
  if (metadata === undefined) {
    deny('Office context was not issued by server authorization');
  }
  if (
    metadata.decisionScope === null ||
    !sameDecisionScope(metadata.decisionScope, proposal)
  ) {
    deny('Office context is not bound to this immutable proposal scope');
  }
  const current = await resolveAuthorizedMembership({
    principal: metadata.principal,
    resolver: metadata.resolver,
    worldId: metadata.context.worldId,
    requestedCountryId: metadata.context.countryId,
    requestedOfficeId: metadata.context.officeId,
    capability: metadata.context.capability,
  });
  if (
    current.authorizationVersion !== metadata.context.authorizationVersion ||
    current.teamId !== metadata.context.teamId
  ) {
    deny('Office authorization revision changed');
  }
  return metadata.context;
}

/**
 * Re-resolves current Command authority from the server-held authorization
 * metadata. The supplied context is intake audit evidence, not a capability
 * token. A newly branded context is returned so callers cannot accidentally
 * treat the stale authorization revision as commit authority.
 */
export async function reauthorizeOfficeCapability(
  value: unknown,
): Promise<AuthorizedOfficeContext> {
  if (!isAuthorizedOfficeContext(value)) {
    deny('Office context was not issued by server authorization');
  }
  const metadata = authorizedOfficeMetadata.get(value);
  if (metadata === undefined) {
    deny('Office context was not issued by server authorization');
  }
  const current = await resolveAuthorizedMembership({
    principal: metadata.principal,
    resolver: metadata.resolver,
    worldId: metadata.context.worldId,
    requestedCountryId: metadata.context.countryId,
    requestedOfficeId: metadata.context.officeId,
    capability: metadata.context.capability,
  });
  const context = Object.freeze({
    authorizationVersion: current.authorizationVersion,
    authSubject: current.authSubject,
    worldId: current.worldId,
    teamId: current.teamId,
    countryId: current.countryId,
    officeId: metadata.context.officeId,
    capability: metadata.context.capability,
  }) as AuthorizedOfficeContext;
  authorizedOfficeMetadata.set(context, {
    context,
    principal: metadata.principal,
    resolver: metadata.resolver,
    decisionScope: metadata.decisionScope,
  });
  return context;
}
