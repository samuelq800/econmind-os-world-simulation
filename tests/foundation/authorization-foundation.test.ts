import { beforeEach, describe, expect, it } from 'vitest';

import {
  AUTHORIZATION_LIFECYCLE_RULES,
  DOMAIN_ERROR_CODES,
  OFFICE_APPROVAL_CAPABILITY,
  OFFICE_DEFINITIONS,
  actorId,
  authenticateIdentity,
  authorizeOfficeCapability,
  authorizeProjection,
  countryId,
  createApprovalProposal,
  invalidateApprovalProposal,
  officeId,
  proposalId,
  rejectApprovalProposal,
  reviseApprovalProposal,
  signApprovalProposal,
  teamId,
  userId,
  worldId,
  type AuthenticatedPrincipal,
  type AuthorizationResolver,
  type MembershipSnapshot,
} from '../../packages/core/src/index.js';

const WORLD = worldId('WORLD_1');
const COUNTRY_A = countryId('COUNTRY_A');
const COUNTRY_B = countryId('COUNTRY_B');
const USER = userId('USER_A');
const TEAM = teamId('TEAM_A');
const FINANCE = officeId('FINANCE');
const CENTRAL_BANK = officeId('CENTRAL_BANK');

const verifier = {
  async verify() {
    return {
      subject: 'USER_A',
      issuer: 'https://auth.invalid',
      audience: 'world-v2',
      issuedAt: '2026-09-09T00:00:00Z',
      expiresAt: '2026-09-09T01:00:00Z',
    };
  },
};

async function principal() {
  return authenticateIdentity({
    token: 'synthetic-signed-token',
    profile: {
      user_id: 'USER_A',
      display_name: 'Player A',
      school_id: 'SCHOOL_A',
    },
    verifier,
  });
}

function membership(
  overrides: Partial<MembershipSnapshot> = {},
): MembershipSnapshot {
  return {
    authorizationVersion: 'AUTH_V1',
    userId: USER,
    worldId: WORLD,
    teamId: TEAM,
    countryId: COUNTRY_A,
    officeAssignments: [FINANCE, CENTRAL_BANK],
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: ['NEGOTIATION_1'],
    ...overrides,
  };
}

function resolver(
  getSnapshot: () => MembershipSnapshot | null,
): AuthorizationResolver {
  return {
    async resolveCurrentMembership() {
      return getSnapshot();
    },
  };
}

async function approvalContext(
  authenticated: AuthenticatedPrincipal,
  current: MembershipSnapshot,
  assignedOffice: typeof FINANCE | typeof CENTRAL_BANK,
) {
  return authorizeOfficeCapability({
    principal: authenticated,
    resolver: resolver(() => current),
    worldId: WORLD,
    requestedCountryId: COUNTRY_A,
    requestedOfficeId: assignedOffice,
    capability: OFFICE_APPROVAL_CAPABILITY,
  });
}

describe('V05.1 identity and six-Office authorization', () => {
  it('accepts exactly the three shared identity facts after token verification', async () => {
    const authenticated = await principal();
    expect(Object.keys(authenticated.facts).sort()).toEqual([
      'display_name',
      'school_id',
      'user_id',
    ]);
  });

  it.each(['role', 'platform_role', 'country_id', 'office_id'])(
    'rejects legacy or portable authority field %s',
    async (field) => {
      await expect(
        authenticateIdentity({
          token: 'synthetic',
          profile: {
            user_id: 'USER_A',
            display_name: null,
            school_id: null,
            [field]: 'ADMIN',
          },
          verifier,
        }),
      ).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      });
    },
  );

  it('rejects a token subject/profile mismatch', async () => {
    await expect(
      authenticateIdentity({
        token: 'synthetic',
        profile: { user_id: 'USER_B', display_name: null, school_id: null },
        verifier,
      }),
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
    });
  });

  it('defines exactly six canonical Offices', () => {
    expect(Object.keys(OFFICE_DEFINITIONS)).toEqual([
      'CAPTAIN',
      'CENTRAL_BANK',
      'FINANCE',
      'INDUSTRY',
      'SOCIAL',
      'TRADE',
    ]);
  });

  it('allows a Finance capability from current server membership', async () => {
    const result = await authorizeOfficeCapability({
      principal: await principal(),
      resolver: resolver(() => membership()),
      worldId: WORLD,
      requestedCountryId: COUNTRY_A,
      requestedOfficeId: FINANCE,
      capability: 'FINANCE_BUDGET',
    });
    expect(result.officeId).toBe(FINANCE);
  });

  it('denies unauthenticated, cross-country, unassigned, and cross-Office claims', async () => {
    const authenticated = await principal();
    const currentResolver = resolver(() =>
      membership({ officeAssignments: [FINANCE] }),
    );
    await expect(
      authorizeOfficeCapability({
        principal: null,
        resolver: currentResolver,
        worldId: WORLD,
        requestedCountryId: COUNTRY_A,
        requestedOfficeId: FINANCE,
        capability: 'FINANCE_BUDGET',
      }),
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.AUTHENTICATION_REQUIRED,
    });
    await expect(
      authorizeOfficeCapability({
        principal: authenticated,
        resolver: currentResolver,
        worldId: WORLD,
        requestedCountryId: COUNTRY_B,
        requestedOfficeId: FINANCE,
        capability: 'FINANCE_BUDGET',
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
    await expect(
      authorizeOfficeCapability({
        principal: authenticated,
        resolver: currentResolver,
        worldId: WORLD,
        requestedCountryId: COUNTRY_A,
        requestedOfficeId: CENTRAL_BANK,
        capability: 'CENTRAL_BANK_MONETARY_POLICY',
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
    await expect(
      authorizeOfficeCapability({
        principal: authenticated,
        resolver: currentResolver,
        worldId: WORLD,
        requestedCountryId: COUNTRY_A,
        requestedOfficeId: FINANCE,
        capability: 'CENTRAL_BANK_MONETARY_POLICY',
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
  });
});

describe('V05.2 versioned Office approvals', () => {
  let authenticated: AuthenticatedPrincipal;

  beforeEach(async () => {
    authenticated = await principal();
  });

  function proposal() {
    return createApprovalProposal({
      id: proposalId('PROPOSAL_1'),
      version: 'VERSION_1',
      worldId: WORLD,
      countryId: COUNTRY_A,
      payloadFingerprint: 'sha256:synthetic-v1',
      resolution: {
        policyVersion: 'UNAPPROVED_ADR_09_CONTRACT_V1',
        requiredOffices: [FINANCE, CENTRAL_BANK],
      },
    });
  }

  it('records the same actor under two Offices as two independent signatures', async () => {
    const current = membership();
    const finance = await approvalContext(authenticated, current, FINANCE);
    const centralBank = await approvalContext(
      authenticated,
      current,
      CENTRAL_BANK,
    );
    const first = signApprovalProposal({
      proposal: proposal(),
      context: finance,
      actorId: actorId('ACTOR_1'),
      expectedVersion: 'VERSION_1',
      signedAt: '2026-09-09T00:00:00Z',
    });
    const second = signApprovalProposal({
      proposal: first,
      context: centralBank,
      actorId: actorId('ACTOR_1'),
      expectedVersion: 'VERSION_1',
      signedAt: '2026-09-09T00:01:00Z',
    });
    expect(first.status).toBe('PENDING');
    expect(second.status).toBe('APPROVED');
    expect(second.signatures.map((item) => item.officeId)).toEqual([
      FINANCE,
      CENTRAL_BANK,
    ]);
  });

  it('rejects stale versions and duplicate Office signatures', async () => {
    const context = await approvalContext(authenticated, membership(), FINANCE);
    expect(() =>
      signApprovalProposal({
        proposal: proposal(),
        context,
        actorId: actorId('ACTOR_1'),
        expectedVersion: 'VERSION_0',
        signedAt: '2026-09-09T00:00:00Z',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.APPROVAL_VERSION_MISMATCH,
      }),
    );
    const signed = signApprovalProposal({
      proposal: proposal(),
      context,
      actorId: actorId('ACTOR_1'),
      expectedVersion: 'VERSION_1',
      signedAt: '2026-09-09T00:00:00Z',
    });
    expect(() =>
      signApprovalProposal({
        proposal: signed,
        context,
        actorId: actorId('ACTOR_2'),
        expectedVersion: 'VERSION_1',
        signedAt: '2026-09-09T00:01:00Z',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      }),
    );
  });

  it('rejects a client-forged approval context', () => {
    expect(() =>
      signApprovalProposal({
        proposal: proposal(),
        context: {
          authorizationVersion: 'FORGED',
          userId: USER,
          worldId: WORLD,
          teamId: TEAM,
          countryId: COUNTRY_A,
          officeId: FINANCE,
          capability: OFFICE_APPROVAL_CAPABILITY,
        } as never,
        actorId: actorId('ACTOR_1'),
        expectedVersion: 'VERSION_1',
        signedAt: '2026-09-09T00:00:00Z',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      }),
    );
  });

  it('never resurrects a rejected version; revision creates a new proposal', async () => {
    const context = await approvalContext(authenticated, membership(), FINANCE);
    const rejected = rejectApprovalProposal({
      proposal: proposal(),
      context,
      expectedVersion: 'VERSION_1',
    });
    expect(() =>
      signApprovalProposal({
        proposal: rejected,
        context,
        actorId: actorId('ACTOR_1'),
        expectedVersion: 'VERSION_1',
        signedAt: '2026-09-09T00:00:00Z',
      }),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.APPROVAL_REJECTED }),
    );
    const revision = reviseApprovalProposal({
      proposal: rejected,
      id: proposalId('PROPOSAL_2'),
      version: 'VERSION_2',
      payloadFingerprint: 'sha256:synthetic-v2',
      resolution: {
        policyVersion: 'UNAPPROVED_ADR_09_CONTRACT_V1',
        requiredOffices: [FINANCE],
      },
    });
    expect(revision.previous.status).toBe('REJECTED');
    expect(revision.revised.status).toBe('PENDING');
    expect(revision.revised.supersedesId).toBe(rejected.id);
  });

  it('prevents invalidated versions from being signed or revised', async () => {
    const invalidated = invalidateApprovalProposal(proposal());
    const context = await approvalContext(authenticated, membership(), FINANCE);
    expect(() =>
      signApprovalProposal({
        proposal: invalidated,
        context,
        actorId: actorId('ACTOR_1'),
        expectedVersion: 'VERSION_1',
        signedAt: '2026-09-09T00:00:00Z',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.APPROVAL_INVALIDATED,
      }),
    );
    expect(() =>
      reviseApprovalProposal({
        proposal: invalidated,
        id: proposalId('PROPOSAL_2'),
        version: 'VERSION_2',
        payloadFingerprint: 'sha256:synthetic-v2',
        resolution: {
          policyVersion: 'UNAPPROVED_ADR_09_CONTRACT_V1',
          requiredOffices: [FINANCE],
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.APPROVAL_INVALIDATED,
      }),
    );
  });
});

describe('V05.3 classified projections and revocation lifecycle', () => {
  it('allows public, own-country, assigned-Office, party, and authoritative admin scopes', async () => {
    const authenticated = await principal();
    const normal = resolver(() => membership());
    await expect(
      authorizeProjection({
        principal: null,
        resolver: normal,
        scope: { classification: 'PUBLIC', worldId: WORLD },
      }),
    ).resolves.toMatchObject({ classification: 'PUBLIC' });
    await expect(
      authorizeProjection({
        principal: authenticated,
        resolver: normal,
        scope: {
          classification: 'COUNTRY',
          worldId: WORLD,
          countryId: COUNTRY_A,
        },
      }),
    ).resolves.toMatchObject({ classification: 'COUNTRY' });
    await expect(
      authorizeProjection({
        principal: authenticated,
        resolver: normal,
        scope: {
          classification: 'OFFICE_PRIVATE',
          worldId: WORLD,
          countryId: COUNTRY_A,
          officeId: FINANCE,
        },
      }),
    ).resolves.toMatchObject({ classification: 'OFFICE_PRIVATE' });
    await expect(
      authorizeProjection({
        principal: authenticated,
        resolver: normal,
        scope: {
          classification: 'NEGOTIATION_PARTY',
          worldId: WORLD,
          partyId: 'NEGOTIATION_1',
        },
      }),
    ).resolves.toMatchObject({ classification: 'NEGOTIATION_PARTY' });
    await expect(
      authorizeProjection({
        principal: authenticated,
        resolver: resolver(() => membership({ isWorldAdmin: true })),
        scope: { classification: 'ADMIN', worldId: WORLD },
      }),
    ).resolves.toMatchObject({ classification: 'ADMIN' });
  });

  it('denies forged country, Office, party, and admin projection scopes', async () => {
    const authenticated = await principal();
    const normal = resolver(() =>
      membership({ officeAssignments: [FINANCE], negotiationPartyIds: [] }),
    );
    for (const scope of [
      {
        classification: 'COUNTRY' as const,
        worldId: WORLD,
        countryId: COUNTRY_B,
      },
      {
        classification: 'OFFICE_PRIVATE' as const,
        worldId: WORLD,
        countryId: COUNTRY_A,
        officeId: CENTRAL_BANK,
      },
      {
        classification: 'NEGOTIATION_PARTY' as const,
        worldId: WORLD,
        partyId: 'NEGOTIATION_2',
      },
      { classification: 'ADMIN' as const, worldId: WORLD },
    ]) {
      await expect(
        authorizeProjection({
          principal: authenticated,
          resolver: normal,
          scope,
        }),
      ).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.PROJECTION_ACCESS_DENIED,
      });
    }
  });

  it('revocation denies new authority without deleting accepted facts', async () => {
    const authenticated = await principal();
    let current: MembershipSnapshot | null = membership();
    const mutableResolver = resolver(() => current);
    await expect(
      authorizeOfficeCapability({
        principal: authenticated,
        resolver: mutableResolver,
        worldId: WORLD,
        requestedCountryId: COUNTRY_A,
        requestedOfficeId: FINANCE,
        capability: 'FINANCE_TREASURY',
      }),
    ).resolves.toMatchObject({ authorizationVersion: 'AUTH_V1' });
    const acceptedFact = Object.freeze({
      id: 'ACCEPTED_FACT_1',
      amount: '100.00',
    });
    current = null;
    await expect(
      authorizeOfficeCapability({
        principal: authenticated,
        resolver: mutableResolver,
        worldId: WORLD,
        requestedCountryId: COUNTRY_A,
        requestedOfficeId: FINANCE,
        capability: 'FINANCE_TREASURY',
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
    expect(acceptedFact).toEqual({ id: 'ACCEPTED_FACT_1', amount: '100.00' });
    expect(AUTHORIZATION_LIFECYCLE_RULES).toMatchObject({
      newActionsRequireCurrentAuthorization: true,
      acceptedFactsSurviveIdentityRevocation: true,
      queuedExecution: 'REQUIRES_EXPLICIT_COMMAND_POLICY',
    });
  });
});
