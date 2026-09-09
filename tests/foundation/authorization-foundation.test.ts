import { beforeEach, describe, expect, it } from 'vitest';

import {
  AUTHORIZATION_LIFECYCLE_RULES,
  DOMAIN_ERROR_CODES,
  OFFICE_APPROVAL_CAPABILITY,
  OFFICE_DEFINITIONS,
  actorId,
  authSubject,
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
  worldId,
  type AuthenticatedPrincipal,
  type AuthorizationResolver,
  type MembershipSnapshot,
} from '../../packages/core/src/index.js';

const WORLD = worldId('WORLD_1');
const COUNTRY_A = countryId('COUNTRY_A');
const COUNTRY_B = countryId('COUNTRY_B');
const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_UUID = '7f76f8de-95c7-4c4d-8714-4f64fbf6c120';
const USER = authSubject(USER_UUID);
const TEAM = teamId('TEAM_A');
const FINANCE = officeId('FINANCE');
const CENTRAL_BANK = officeId('CENTRAL_BANK');
const PROPOSAL_ID = proposalId('PROPOSAL_1');
const PROPOSAL_SCOPE = Object.freeze({
  proposalId: PROPOSAL_ID,
  proposalVersion: 'VERSION_1',
  worldId: WORLD,
  countryId: COUNTRY_A,
  payloadFingerprint: 'sha256:synthetic-v1',
  policyVersion: 'UNAPPROVED_ADR_09_CONTRACT_V1',
  requiredOffices: Object.freeze([FINANCE, CENTRAL_BANK]),
});

const verifier = {
  async verify() {
    return {
      subject: USER_UUID,
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
      user_id: USER_UUID,
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
    authSubject: USER,
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
  getSubject: () => typeof USER | null = () => USER,
): AuthorizationResolver {
  return {
    async resolveCurrentIdentity() {
      return getSubject();
    },
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
    decisionScope: PROPOSAL_SCOPE,
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
            user_id: USER_UUID,
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
        profile: {
          user_id: OTHER_USER_UUID,
          display_name: null,
          school_id: null,
        },
        verifier,
      }),
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
    });
  });

  it('normalizes PostgreSQL UUID subjects and rejects malformed or revoked identities', async () => {
    const upper = USER_UUID.toUpperCase();
    await expect(
      authenticateIdentity({
        token: 'synthetic',
        profile: { user_id: upper, display_name: null, school_id: null },
        verifier: {
          ...verifier,
          verify: async () => ({
            ...(await verifier.verify()),
            subject: upper,
          }),
        },
      }),
    ).resolves.toMatchObject({
      authSubject: USER,
      facts: { user_id: USER_UUID },
    });
    await expect(
      authenticateIdentity({
        token: 'synthetic',
        profile: { user_id: 'not-a-uuid', display_name: null, school_id: null },
        verifier,
      }),
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
    });
    await expect(
      authenticateIdentity({
        token: 'revoked',
        profile: { user_id: USER_UUID, display_name: null, school_id: null },
        verifier: {
          async verify() {
            throw new Error('revoked identity');
          },
        },
      }),
    ).rejects.toThrow('revoked identity');
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
      id: PROPOSAL_ID,
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
    const first = await signApprovalProposal({
      proposal: proposal(),
      context: finance,
      actorId: actorId('ACTOR_1'),
      expectedVersion: 'VERSION_1',
      signedAt: '2026-09-09T00:00:00Z',
    });
    const second = await signApprovalProposal({
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
    await expect(
      signApprovalProposal({
        proposal: proposal(),
        context,
        actorId: actorId('ACTOR_1'),
        expectedVersion: 'VERSION_0',
        signedAt: '2026-09-09T00:00:00Z',
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.APPROVAL_VERSION_MISMATCH,
      }),
    );
    const signed = await signApprovalProposal({
      proposal: proposal(),
      context,
      actorId: actorId('ACTOR_1'),
      expectedVersion: 'VERSION_1',
      signedAt: '2026-09-09T00:00:00Z',
    });
    await expect(
      signApprovalProposal({
        proposal: signed,
        context,
        actorId: actorId('ACTOR_2'),
        expectedVersion: 'VERSION_1',
        signedAt: '2026-09-09T00:01:00Z',
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      }),
    );
  });

  it('rejects a client-forged approval context', async () => {
    await expect(
      signApprovalProposal({
        proposal: proposal(),
        context: {
          authorizationVersion: 'FORGED',
          authSubject: USER,
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
    ).rejects.toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      }),
    );
  });

  it('rejects spread, assigned, symbol-copied, and scope-replaced contexts', async () => {
    const issued = await approvalContext(authenticated, membership(), FINANCE);
    const copiedSymbols = Object.fromEntries(
      Object.getOwnPropertySymbols(issued).map((symbol) => [
        symbol,
        (issued as unknown as Record<PropertyKey, unknown>)[symbol],
      ]),
    );
    const attacks = [
      { ...issued },
      Object.assign({}, issued),
      { ...issued, ...copiedSymbols },
      { ...issued, countryId: COUNTRY_B },
      { ...issued, officeId: CENTRAL_BANK },
      { ...issued, capability: 'CENTRAL_BANK_MONETARY_POLICY' },
    ];
    for (const context of attacks) {
      await expect(
        signApprovalProposal({
          proposal: proposal(),
          context: context as never,
          actorId: actorId('ACTOR_1'),
          expectedVersion: 'VERSION_1',
          signedAt: '2026-09-09T00:00:00Z',
        }),
      ).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      });
    }
  });

  it('binds an issued context to the complete immutable proposal scope', async () => {
    const context = await approvalContext(authenticated, membership(), FINANCE);
    const forgedRepresentation = Object.freeze({
      ...proposal(),
      payloadFingerprint: 'sha256:attacker-controlled',
      policyVersion: 'ATTACKER_POLICY',
      requiredOffices: Object.freeze([FINANCE]),
    });
    await expect(
      signApprovalProposal({
        proposal: forgedRepresentation,
        context,
        actorId: actorId('ACTOR_1'),
        expectedVersion: 'VERSION_1',
        signedAt: '2026-09-09T00:00:00Z',
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
  });

  it.each([
    ['membership revoked', null],
    ['Office reassigned', membership({ officeAssignments: [CENTRAL_BANK] })],
    ['user suspended', membership({ suspended: true })],
    [
      'authorization revision changed',
      membership({ authorizationVersion: 'AUTH_V2' }),
    ],
    ['country replaced', membership({ countryId: COUNTRY_B })],
  ] as const)(
    're-resolves current authority when %s after context creation',
    async (_name, replacement) => {
      let current: MembershipSnapshot | null = membership();
      const context = await authorizeOfficeCapability({
        principal: authenticated,
        resolver: resolver(() => current),
        worldId: WORLD,
        requestedCountryId: COUNTRY_A,
        requestedOfficeId: FINANCE,
        capability: OFFICE_APPROVAL_CAPABILITY,
        decisionScope: PROPOSAL_SCOPE,
      });
      current = replacement;
      await expect(
        signApprovalProposal({
          proposal: proposal(),
          context,
          actorId: actorId('ACTOR_1'),
          expectedVersion: 'VERSION_1',
          signedAt: '2026-09-09T00:00:00Z',
        }),
      ).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      });
    },
  );

  it('rejects an identity revoked after context creation', async () => {
    let currentSubject: typeof USER | null = USER;
    const currentResolver = resolver(
      () => membership(),
      () => currentSubject,
    );
    const context = await authorizeOfficeCapability({
      principal: authenticated,
      resolver: currentResolver,
      worldId: WORLD,
      requestedCountryId: COUNTRY_A,
      requestedOfficeId: FINANCE,
      capability: OFFICE_APPROVAL_CAPABILITY,
      decisionScope: PROPOSAL_SCOPE,
    });
    currentSubject = null;
    await expect(
      rejectApprovalProposal({
        proposal: proposal(),
        context,
        expectedVersion: 'VERSION_1',
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
  });

  it('binds authority to one proposal version and preserves accepted history', async () => {
    let current: MembershipSnapshot | null = membership();
    const context = await authorizeOfficeCapability({
      principal: authenticated,
      resolver: resolver(() => current),
      worldId: WORLD,
      requestedCountryId: COUNTRY_A,
      requestedOfficeId: FINANCE,
      capability: OFFICE_APPROVAL_CAPABILITY,
      decisionScope: PROPOSAL_SCOPE,
    });
    const accepted = await signApprovalProposal({
      proposal: proposal(),
      context,
      actorId: actorId('ACTOR_1'),
      expectedVersion: 'VERSION_1',
      signedAt: '2026-09-09T00:00:00Z',
    });
    current = null;
    expect(accepted.signatures).toHaveLength(1);
    expect(accepted.signatures[0]).toMatchObject({ authSubject: USER });

    const revised = createApprovalProposal({
      id: proposalId('PROPOSAL_2'),
      version: 'VERSION_2',
      worldId: WORLD,
      countryId: COUNTRY_A,
      payloadFingerprint: 'sha256:synthetic-v2',
      resolution: {
        policyVersion: 'UNAPPROVED_ADR_09_CONTRACT_V1',
        requiredOffices: [FINANCE],
      },
    });
    await expect(
      rejectApprovalProposal({
        proposal: revised,
        context,
        expectedVersion: 'VERSION_2',
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
  });

  it('never resurrects a rejected version; revision creates a new proposal', async () => {
    const context = await approvalContext(authenticated, membership(), FINANCE);
    const rejected = await rejectApprovalProposal({
      proposal: proposal(),
      context,
      expectedVersion: 'VERSION_1',
    });
    await expect(
      signApprovalProposal({
        proposal: rejected,
        context,
        actorId: actorId('ACTOR_1'),
        expectedVersion: 'VERSION_1',
        signedAt: '2026-09-09T00:00:00Z',
      }),
    ).rejects.toThrowError(
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
    await expect(
      signApprovalProposal({
        proposal: invalidated,
        context,
        actorId: actorId('ACTOR_1'),
        expectedVersion: 'VERSION_1',
        signedAt: '2026-09-09T00:00:00Z',
      }),
    ).rejects.toThrowError(
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
