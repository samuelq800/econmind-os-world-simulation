import {
  authSubject,
  authorizeProjection,
  officeId,
  teamId,
  type AuthenticatedPrincipal,
  type AuthorizationResolver,
  type CountryId,
  type MembershipSnapshot,
  type OfficeId,
  type ProjectionScope,
  type WorldId,
} from '@econmind/core';

import {
  V10_TWO_COUNTRY_TEST_FIXTURE_STATUS,
  createV10TwoCountryTestFixture,
} from './v10-two-country-fixture.js';

/** Test-only V10.1 preparation; it is neither runtime state nor policy. */
export const V101_AUTHORIZATION_PROJECTION_FIXTURE_STATUS =
  'TEST_ONLY_NON_AUTHORITATIVE' as const;

export interface V101AuthoritativeWatermark {
  readonly worldId: WorldId;
  readonly worldVersion: '0';
  readonly eventSequence: '0';
}

export interface V101CountryAuthorizationProjection {
  readonly kind: 'COUNTRY';
  readonly countryId: CountryId;
  readonly teamId: ReturnType<typeof teamId>;
  readonly watermark: V101AuthoritativeWatermark;
}

export interface V101OfficeAuthorizationProjection {
  readonly kind: 'OFFICE_PRIVATE';
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
  readonly teamId: ReturnType<typeof teamId>;
  readonly holderAuthSubject: ReturnType<typeof authSubject>;
  readonly watermark: V101AuthoritativeWatermark;
}

export interface V101NegotiationAuthorizationProjection {
  readonly kind: 'NEGOTIATION_PARTY';
  readonly partyId: string;
  readonly participantCountryIds: readonly CountryId[];
  readonly watermark: V101AuthoritativeWatermark;
}

export type V101ScopedProjectionScope = Extract<
  ProjectionScope,
  {
    readonly classification: 'COUNTRY' | 'OFFICE_PRIVATE' | 'NEGOTIATION_PARTY';
  }
>;

export type V101ScopedProjectionResult =
  | V101CountryAuthorizationProjection
  | V101OfficeAuthorizationProjection
  | V101NegotiationAuthorizationProjection;

export interface V101AuthorizationProjectionSnapshot {
  readonly watermark: V101AuthoritativeWatermark;
  readonly countries: readonly V101CountryAuthorizationProjection[];
  readonly offices: readonly V101OfficeAuthorizationProjection[];
  readonly negotiationParties: readonly V101NegotiationAuthorizationProjection[];
}

export interface V101AuthoritativeAuthorizationState {
  readonly fixtureStatus: typeof V10_TWO_COUNTRY_TEST_FIXTURE_STATUS;
  readonly watermark: V101AuthoritativeWatermark;
  readonly countries: readonly Readonly<{
    countryId: CountryId;
    teamId: ReturnType<typeof teamId>;
  }>[];
  readonly offices: readonly Readonly<{
    countryId: CountryId;
    officeId: OfficeId;
    teamId: ReturnType<typeof teamId>;
    holderAuthSubject: ReturnType<typeof authSubject>;
  }>[];
  readonly negotiationParties: readonly Readonly<{
    partyId: string;
    participantCountryIds: readonly CountryId[];
  }>[];
}

export interface V101AuthorizationProjectionFixture {
  readonly status: typeof V101_AUTHORIZATION_PROJECTION_FIXTURE_STATUS;
  readonly authoritative: V101AuthoritativeAuthorizationState;
  readonly principals: Readonly<{
    sellerTrade: AuthenticatedPrincipal;
    buyerTrade: AuthenticatedPrincipal;
  }>;
  readonly resolver: AuthorizationResolver;
  rebuild(): V101AuthorizationProjectionSnapshot;
  deleteProjection(): void;
  hasProjection(): boolean;
  readProjection(): V101AuthorizationProjectionSnapshot | null;
  query(
    input: Readonly<{
      principal: AuthenticatedPrincipal | null;
      scope: V101ScopedProjectionScope;
    }>,
  ): Promise<V101ScopedProjectionResult>;
}

function freezeWatermark(
  watermark: V101AuthoritativeWatermark,
): V101AuthoritativeWatermark {
  return Object.freeze({ ...watermark });
}

function copyCountry(
  value: V101CountryAuthorizationProjection,
): V101CountryAuthorizationProjection {
  return Object.freeze({
    ...value,
    watermark: freezeWatermark(value.watermark),
  });
}

function copyOffice(
  value: V101OfficeAuthorizationProjection,
): V101OfficeAuthorizationProjection {
  return Object.freeze({
    ...value,
    watermark: freezeWatermark(value.watermark),
  });
}

function copyNegotiation(
  value: V101NegotiationAuthorizationProjection,
): V101NegotiationAuthorizationProjection {
  return Object.freeze({
    ...value,
    participantCountryIds: Object.freeze([...value.participantCountryIds]),
    watermark: freezeWatermark(value.watermark),
  });
}

function copySnapshot(
  value: V101AuthorizationProjectionSnapshot,
): V101AuthorizationProjectionSnapshot {
  return Object.freeze({
    watermark: freezeWatermark(value.watermark),
    countries: Object.freeze(value.countries.map(copyCountry)),
    offices: Object.freeze(value.offices.map(copyOffice)),
    negotiationParties: Object.freeze(
      value.negotiationParties.map(copyNegotiation),
    ),
  });
}

function assertProjectionMaterialized(
  value: V101AuthorizationProjectionSnapshot | null,
): V101AuthorizationProjectionSnapshot {
  if (value === null) {
    throw new Error('V101_AUTHORIZATION_PROJECTION_NOT_MATERIALIZED');
  }
  return value;
}

function assertWatermark(
  projection: V101AuthorizationProjectionSnapshot,
  authoritative: V101AuthoritativeAuthorizationState,
): void {
  if (
    projection.watermark.worldId !== authoritative.watermark.worldId ||
    projection.watermark.worldVersion !==
      authoritative.watermark.worldVersion ||
    projection.watermark.eventSequence !== authoritative.watermark.eventSequence
  ) {
    throw new Error('V101_AUTHORIZATION_PROJECTION_WATERMARK_MISMATCH');
  }
}

function deriveProjection(
  authoritative: V101AuthoritativeAuthorizationState,
): V101AuthorizationProjectionSnapshot {
  const watermark = freezeWatermark(authoritative.watermark);
  return Object.freeze({
    watermark,
    countries: Object.freeze(
      authoritative.countries.map((country) =>
        Object.freeze({
          kind: 'COUNTRY' as const,
          countryId: country.countryId,
          teamId: country.teamId,
          watermark: freezeWatermark(watermark),
        }),
      ),
    ),
    offices: Object.freeze(
      authoritative.offices.map((office) =>
        Object.freeze({
          kind: 'OFFICE_PRIVATE' as const,
          countryId: office.countryId,
          officeId: office.officeId,
          teamId: office.teamId,
          holderAuthSubject: office.holderAuthSubject,
          watermark: freezeWatermark(watermark),
        }),
      ),
    ),
    negotiationParties: Object.freeze(
      authoritative.negotiationParties.map((party) =>
        Object.freeze({
          kind: 'NEGOTIATION_PARTY' as const,
          partyId: party.partyId,
          participantCountryIds: Object.freeze([
            ...party.participantCountryIds,
          ]),
          watermark: freezeWatermark(watermark),
        }),
      ),
    ),
  });
}

function membership(input: {
  readonly principal: AuthenticatedPrincipal;
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly teamId: ReturnType<typeof teamId>;
  readonly officeAssignments: readonly OfficeId[];
}): MembershipSnapshot {
  return Object.freeze({
    authorizationVersion: `AUTH_V101_${input.countryId}_1`,
    authSubject: input.principal.authSubject,
    worldId: input.worldId,
    teamId: input.teamId,
    countryId: input.countryId,
    officeAssignments: Object.freeze([...input.officeAssignments]),
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: Object.freeze(['PARTY_V101_BILATERAL_TEST']),
  });
}

export function createV101AuthorizationProjectionFixture(): Readonly<V101AuthorizationProjectionFixture> {
  const twoCountry = createV10TwoCountryTestFixture();
  const sellerTrade = twoCountry.officeActors.sellerTrade.principal;
  const buyerTrade = twoCountry.officeActors.buyerTrade.principal;
  const sellerTeam = teamId('TEAM_V101_SELLER_TEST');
  const buyerTeam = teamId('TEAM_V101_BUYER_TEST');
  const watermark: V101AuthoritativeWatermark = Object.freeze({
    worldId: twoCountry.worldId,
    worldVersion: '0',
    eventSequence: '0',
  });
  const authoritative: V101AuthoritativeAuthorizationState = Object.freeze({
    fixtureStatus: twoCountry.status,
    watermark,
    countries: Object.freeze([
      Object.freeze({
        countryId: twoCountry.countries.seller,
        teamId: sellerTeam,
      }),
      Object.freeze({
        countryId: twoCountry.countries.buyer,
        teamId: buyerTeam,
      }),
    ]),
    offices: Object.freeze([
      Object.freeze({
        countryId: twoCountry.countries.seller,
        officeId: officeId('TRADE'),
        teamId: sellerTeam,
        holderAuthSubject: sellerTrade.authSubject,
      }),
      Object.freeze({
        countryId: twoCountry.countries.buyer,
        officeId: officeId('TRADE'),
        teamId: buyerTeam,
        holderAuthSubject: buyerTrade.authSubject,
      }),
      Object.freeze({
        countryId: twoCountry.countries.buyer,
        officeId: officeId('FINANCE'),
        teamId: buyerTeam,
        holderAuthSubject: buyerTrade.authSubject,
      }),
    ]),
    negotiationParties: Object.freeze([
      Object.freeze({
        partyId: 'PARTY_V101_BILATERAL_TEST',
        participantCountryIds: Object.freeze([
          twoCountry.countries.seller,
          twoCountry.countries.buyer,
        ]),
      }),
    ]),
  });
  const memberships = new Map([
    [
      sellerTrade.authSubject,
      membership({
        principal: sellerTrade,
        worldId: twoCountry.worldId,
        countryId: twoCountry.countries.seller,
        teamId: sellerTeam,
        officeAssignments: [officeId('TRADE')],
      }),
    ],
    [
      buyerTrade.authSubject,
      membership({
        principal: buyerTrade,
        worldId: twoCountry.worldId,
        countryId: twoCountry.countries.buyer,
        teamId: buyerTeam,
        officeAssignments: [officeId('TRADE'), officeId('FINANCE')],
      }),
    ],
  ] as const);
  const resolver: AuthorizationResolver = Object.freeze({
    async resolveCurrentIdentity(principal: AuthenticatedPrincipal) {
      return memberships.has(principal.authSubject)
        ? principal.authSubject
        : null;
    },
    async resolveCurrentMembership(
      principal: AuthenticatedPrincipal,
      requestedWorldId: WorldId,
    ) {
      return requestedWorldId === authoritative.watermark.worldId
        ? (memberships.get(principal.authSubject) ?? null)
        : null;
    },
  });
  let projection: V101AuthorizationProjectionSnapshot | null = null;
  return Object.freeze({
    status: V101_AUTHORIZATION_PROJECTION_FIXTURE_STATUS,
    authoritative,
    principals: Object.freeze({ sellerTrade, buyerTrade }),
    resolver,
    rebuild: () => {
      projection = deriveProjection(authoritative);
      return copySnapshot(projection);
    },
    deleteProjection: () => {
      projection = null;
    },
    hasProjection: () => projection !== null,
    readProjection: () =>
      projection === null ? null : copySnapshot(projection),
    query: async (
      input: Readonly<{
        principal: AuthenticatedPrincipal | null;
        scope: V101ScopedProjectionScope;
      }>,
    ): Promise<V101ScopedProjectionResult> => {
      const { principal, scope } = input;
      await authorizeProjection({ principal, resolver, scope });
      const current = assertProjectionMaterialized(projection);
      assertWatermark(current, authoritative);
      switch (scope.classification) {
        case 'COUNTRY': {
          const country = current.countries.find(
            (candidate) => candidate.countryId === scope.countryId,
          );
          if (country === undefined)
            throw new Error('V101_COUNTRY_PROJECTION_NOT_FOUND');
          return copyCountry(country);
        }
        case 'OFFICE_PRIVATE': {
          const office = current.offices.find(
            (candidate) =>
              candidate.countryId === scope.countryId &&
              candidate.officeId === scope.officeId,
          );
          if (office === undefined)
            throw new Error('V101_OFFICE_PROJECTION_NOT_FOUND');
          return copyOffice(office);
        }
        case 'NEGOTIATION_PARTY': {
          const party = current.negotiationParties.find(
            (candidate) => candidate.partyId === scope.partyId,
          );
          if (party === undefined)
            throw new Error('V101_NEGOTIATION_PROJECTION_NOT_FOUND');
          return copyNegotiation(party);
        }
        default:
          throw new Error('V101_AUTHORIZATION_PROJECTION_UNKNOWN_SCOPE');
      }
    },
  });
}
