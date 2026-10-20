/** Shared construction/authorization regression only. Not business-flow,
 * source adoption, real membership issuance or six-Office completion evidence. */
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_OFFICE_IDS,
  OFFICE_DEFINITIONS,
  authenticateIdentity,
  authorizeOfficeCapability,
  countryId,
  officeId,
  reauthorizeOfficeCapability,
  teamId,
  worldId,
  type MembershipSnapshot,
} from '../../packages/core/src/index.js';

const names = [
  'CAPTAIN',
  'CENTRAL_BANK',
  'FINANCE',
  'INDUSTRY',
  'SOCIAL',
  'TRADE',
] as const;
const world = worldId('WORLD_F_MECHANISM_ONLY');
const country = countryId('COUNTRY_F_MECHANISM_ONLY');
async function fixture(name: (typeof names)[number]) {
  const subject = '550e8400-e29b-41d4-a716-446655440000';
  const principal = await authenticateIdentity({
    token: 'MECHANISM_NOT_A_REAL_TOKEN',
    profile: { user_id: subject, display_name: null, school_id: null },
    verifier: {
      async verify() {
        return {
          subject,
          issuer: 'https://mechanism.invalid',
          audience: 'MECHANISM_ONLY',
          issuedAt: '2026-10-18T00:00:00Z',
          expiresAt: '2026-10-18T01:00:00Z',
        };
      },
    },
  });
  let current: MembershipSnapshot = {
    authorizationVersion: 'MECHANISM_AUTH_V1',
    authSubject: principal.authSubject,
    worldId: world,
    teamId: teamId('TEAM_F_MECHANISM_ONLY'),
    countryId: country,
    officeAssignments: [officeId(name)],
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: [],
  };
  return {
    request: {
      principal,
      resolver: {
        async resolveCurrentIdentity() {
          return principal.authSubject;
        },
        async resolveCurrentMembership() {
          return current;
        },
      },
      worldId: world,
      requestedCountryId: country,
      requestedOfficeId: officeId(name),
    },
    revoke() {
      current = {
        ...current,
        authorizationVersion: 'MECHANISM_AUTH_V2',
        officeAssignments: [],
      };
    },
  };
}

describe('F six-Office shared construction coverage, not full product completion', () => {
  it('covers the exact canonical six Offices and all 18 existing distinct capabilities', () => {
    expect([...CANONICAL_OFFICE_IDS].sort()).toEqual([...names].sort());
    const capabilities = names.flatMap((name) => [
      ...OFFICE_DEFINITIONS[name].capabilities,
    ]);
    expect(capabilities).toHaveLength(18);
    expect(new Set(capabilities).size).toBe(18);
  });
  it.each(names)(
    '%s constructs a current context for every existing own capability',
    async (name) => {
      const f = await fixture(name);
      for (const capability of OFFICE_DEFINITIONS[name].capabilities) {
        const context = await authorizeOfficeCapability({
          ...f.request,
          capability,
        });
        expect(context.officeId).toBe(name);
        expect(context.capability).toBe(capability);
        expect(context.countryId).toBe(country);
        expect(context.authorizationVersion).toBe('MECHANISM_AUTH_V1');
      }
    },
  );
  it.each(names)(
    '%s rejects capabilities belonging to every other Office',
    async (name) => {
      const f = await fixture(name);
      for (const other of names.filter((n) => n !== name))
        for (const capability of OFFICE_DEFINITIONS[other].capabilities)
          await expect(
            authorizeOfficeCapability({ ...f.request, capability }),
          ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    },
  );
  it.each(names)(
    '%s rejects a previously constructed context after its assignment is revoked',
    async (name) => {
      const f = await fixture(name);
      const context = await authorizeOfficeCapability({
        ...f.request,
        capability: OFFICE_DEFINITIONS[name].capabilities[0],
      });
      f.revoke();
      await expect(reauthorizeOfficeCapability(context)).rejects.toMatchObject({
        code: 'AUTHORIZATION_DENIED',
      });
    },
  );
});
