import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import type { CountryId, OfficeId, WorldId } from '../ids.js';
import type { AuthenticatedPrincipal } from './identity.js';
import type { AuthorizationResolver, MembershipSnapshot } from './offices.js';

export type ProjectionClassification =
  'PUBLIC' | 'COUNTRY' | 'OFFICE_PRIVATE' | 'NEGOTIATION_PARTY' | 'ADMIN';

export type ProjectionScope =
  | { readonly classification: 'PUBLIC'; readonly worldId: WorldId }
  | {
      readonly classification: 'COUNTRY';
      readonly worldId: WorldId;
      readonly countryId: CountryId;
    }
  | {
      readonly classification: 'OFFICE_PRIVATE';
      readonly worldId: WorldId;
      readonly countryId: CountryId;
      readonly officeId: OfficeId;
    }
  | {
      readonly classification: 'NEGOTIATION_PARTY';
      readonly worldId: WorldId;
      readonly partyId: string;
    }
  | { readonly classification: 'ADMIN'; readonly worldId: WorldId };

export const AUTHORIZATION_LIFECYCLE_RULES = Object.freeze({
  newActionsRequireCurrentAuthorization: true,
  acceptedFactsSurviveIdentityRevocation: true,
  acceptedContractsSurviveActorRemoval: true,
  queuedExecution: 'REQUIRES_EXPLICIT_COMMAND_POLICY',
} as const);

export interface ProjectionPermit {
  readonly classification: ProjectionClassification;
  readonly authorizationVersion: string | null;
}

function deny(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.PROJECTION_ACCESS_DENIED,
    'Current server-resolved membership cannot access this projection',
  );
}

function assertCurrentMembership(
  membership: MembershipSnapshot | null,
  principal: AuthenticatedPrincipal,
  worldId: WorldId,
): MembershipSnapshot {
  if (
    !membership ||
    membership.userId !== principal.userId ||
    membership.worldId !== worldId ||
    !membership.active ||
    membership.suspended
  )
    deny();
  return membership;
}

export async function authorizeProjection(input: {
  readonly principal: AuthenticatedPrincipal | null;
  readonly resolver: AuthorizationResolver;
  readonly scope: ProjectionScope;
}): Promise<ProjectionPermit> {
  if (input.scope.classification === 'PUBLIC')
    return Object.freeze({
      classification: 'PUBLIC',
      authorizationVersion: null,
    });
  if (!input.principal)
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHENTICATION_REQUIRED,
      'An authenticated principal is required',
    );
  const membership = assertCurrentMembership(
    await input.resolver.resolveCurrentMembership(
      input.principal,
      input.scope.worldId,
    ),
    input.principal,
    input.scope.worldId,
  );
  switch (input.scope.classification) {
    case 'COUNTRY':
      if (membership.countryId !== input.scope.countryId) deny();
      break;
    case 'OFFICE_PRIVATE':
      if (
        membership.countryId !== input.scope.countryId ||
        !membership.officeAssignments.includes(input.scope.officeId)
      )
        deny();
      break;
    case 'NEGOTIATION_PARTY':
      if (!membership.negotiationPartyIds.includes(input.scope.partyId)) deny();
      break;
    case 'ADMIN':
      if (!membership.isWorldAdmin) deny();
      break;
  }
  return Object.freeze({
    classification: input.scope.classification,
    authorizationVersion: membership.authorizationVersion,
  });
}
