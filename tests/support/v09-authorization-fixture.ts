// PREPARATION_ONLY_NOT_V09_2_STARTED: test infrastructure only.

import {
  authSubject,
  authorizeOfficeCapability,
  countryId,
  officeId,
  teamId,
  worldId,
  type AuthSubject,
  type AuthenticatedPrincipal,
  type AuthorizationCapability,
  type AuthorizationResolver,
  type AuthorizedOfficeContext,
  type CountryId,
  type MembershipSnapshot,
  type OfficeId,
  type WorldId,
} from '../../packages/core/src/index.js';

export interface AuthorizationResolutionTrace {
  readonly kind: 'IDENTITY' | 'MEMBERSHIP';
  readonly revision: string | null;
}

export interface AuthorizationFixtureMutation {
  readonly active?: boolean;
  readonly authSubject?: AuthSubject | null;
  readonly authorizationVersion?: string;
  readonly countryId?: CountryId;
  readonly membershipPresent?: boolean;
  readonly officeAssignments?: readonly OfficeId[];
  readonly suspended?: boolean;
}

const DEFAULT_SUBJECT = authSubject('550e8400-e29b-41d4-a716-446655440000');
const DEFAULT_WORLD = worldId('WORLD_1');
const DEFAULT_COUNTRY = countryId('COUNTRY_1');
const DEFAULT_OFFICE = officeId('FINANCE');

export class MutableV09AuthorizationFixture implements AuthorizationResolver {
  readonly principal: AuthenticatedPrincipal;
  readonly worldId: WorldId;
  #currentSubject: AuthSubject | null;
  #membership: MembershipSnapshot | null;
  #trace: AuthorizationResolutionTrace[] = [];

  constructor(
    input: {
      readonly authSubject?: AuthSubject;
      readonly worldId?: WorldId;
      readonly countryId?: CountryId;
      readonly officeAssignments?: readonly OfficeId[];
      readonly authorizationVersion?: string;
    } = {},
  ) {
    const subject = input.authSubject ?? DEFAULT_SUBJECT;
    this.worldId = input.worldId ?? DEFAULT_WORLD;
    this.#currentSubject = subject;
    this.#membership = Object.freeze({
      active: true,
      authorizationVersion: input.authorizationVersion ?? 'AUTH_REVISION_1',
      authSubject: subject,
      countryId: input.countryId ?? DEFAULT_COUNTRY,
      isWorldAdmin: false,
      negotiationPartyIds: Object.freeze([]),
      officeAssignments: Object.freeze([
        ...(input.officeAssignments ?? [DEFAULT_OFFICE]),
      ]),
      suspended: false,
      teamId: teamId('TEAM_1'),
      worldId: this.worldId,
    });
    this.principal = Object.freeze({
      authSubject: subject,
      facts: Object.freeze({
        display_name: 'V09 deterministic authorization fixture',
        school_id: 'TEST_ONLY',
        user_id: subject,
      }),
      token: Object.freeze({
        audience: 'world-v2-test',
        expiresAt: '2099-01-01T00:00:00.000Z',
        issuedAt: '2026-09-12T00:00:00.000Z',
        issuer: 'https://test.invalid',
        subject,
      }),
    });
  }

  currentMembership(): MembershipSnapshot | null {
    return this.#membership;
  }

  mutate(input: AuthorizationFixtureMutation): void {
    if (input.authSubject !== undefined) {
      this.#currentSubject = input.authSubject;
    }
    if (input.membershipPresent === false) {
      this.#membership = null;
      return;
    }
    const current = this.#membership;
    if (current === null) {
      throw new Error(
        'Set a complete membership fixture before mutating an absent membership',
      );
    }
    this.#membership = Object.freeze({
      ...current,
      active: input.active ?? current.active,
      authorizationVersion:
        input.authorizationVersion ?? current.authorizationVersion,
      countryId: input.countryId ?? current.countryId,
      officeAssignments: Object.freeze([
        ...(input.officeAssignments ?? current.officeAssignments),
      ]),
      suspended: input.suspended ?? current.suspended,
    });
  }

  resolutionTrace(): readonly AuthorizationResolutionTrace[] {
    return Object.freeze([...this.#trace]);
  }

  async resolveCurrentIdentity(): Promise<AuthSubject | null> {
    this.#trace.push(
      Object.freeze({
        kind: 'IDENTITY',
        revision: this.#membership?.authorizationVersion ?? null,
      }),
    );
    return this.#currentSubject;
  }

  async resolveCurrentMembership(
    _principal: AuthenticatedPrincipal,
    requestedWorldId: WorldId,
  ): Promise<MembershipSnapshot | null> {
    this.#trace.push(
      Object.freeze({
        kind: 'MEMBERSHIP',
        revision: this.#membership?.authorizationVersion ?? null,
      }),
    );
    if (requestedWorldId !== this.worldId) return null;
    return this.#membership;
  }

  async authorize(input: {
    readonly capability: AuthorizationCapability;
    readonly countryId?: CountryId;
    readonly officeId?: OfficeId;
  }): Promise<AuthorizedOfficeContext> {
    return authorizeOfficeCapability({
      capability: input.capability,
      principal: this.principal,
      requestedCountryId: input.countryId ?? DEFAULT_COUNTRY,
      requestedOfficeId: input.officeId ?? DEFAULT_OFFICE,
      resolver: this,
      worldId: this.worldId,
    });
  }
}
