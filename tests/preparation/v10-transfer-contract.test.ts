import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  OFFICE_APPROVAL_CAPABILITY,
  actorId,
  authenticateIdentity,
  authorizeOfficeCapability,
  classifyCommandIdentity,
  officeId,
  parseCanonicalCommand,
  signApprovalProposal,
  teamId,
  type ApprovalProposal,
  type MembershipSnapshot,
} from '../../packages/core/src/index.js';
import {
  decisionScope,
  sha256,
  transferCommand,
  transferInput,
  transferProposals,
  transferTerms,
} from './v10-transfer-contract.js';

async function signer(proposal: ApprovalProposal) {
  const subject = '22222222-2222-4222-8222-222222222222';
  const principal = await authenticateIdentity({
    token: 'test-only-token',
    profile: { user_id: subject, display_name: null, school_id: null },
    verifier: {
      async verify() {
        return {
          subject,
          issuer: 'https://auth.invalid',
          audience: 'world-v2',
          issuedAt: '2026-09-12T00:00:00Z',
          expiresAt: '2026-09-12T01:00:00Z',
        };
      },
    },
  });
  let current: MembershipSnapshot = {
    authorizationVersion: 'AUTH_V1',
    authSubject: principal.authSubject,
    worldId: proposal.worldId,
    teamId: teamId('TEAM_TRANSFER_TEST'),
    countryId: proposal.countryId,
    officeAssignments: [officeId('TRADE'), officeId('FINANCE')],
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: [],
  };
  return {
    change(patch: Partial<MembershipSnapshot>) {
      current = { ...current, ...patch };
    },
    context(office: 'TRADE' | 'FINANCE') {
      return authorizeOfficeCapability({
        principal,
        resolver: {
          async resolveCurrentIdentity() {
            return principal.authSubject;
          },
          async resolveCurrentMembership() {
            return current;
          },
        },
        worldId: proposal.worldId,
        requestedCountryId: proposal.countryId,
        requestedOfficeId: officeId(office),
        capability: OFFICE_APPROVAL_CAPABILITY,
        decisionScope: decisionScope(proposal),
      });
    },
  };
}

function sign(
  proposal: ApprovalProposal,
  context: Awaited<ReturnType<Awaited<ReturnType<typeof signer>>['context']>>,
) {
  return signApprovalProposal({
    proposal,
    context,
    actorId: actorId('ACTOR_BUYER_TEST'),
    expectedVersion: 'VERSION_1',
    signedAt: '2026-09-12T00:00:01.000Z',
  });
}

describe('V10.2 preparation: existing command and country/Office contracts', () => {
  it('uses registered tonne units and binds all three country/Office signatures', () => {
    const terms = transferTerms();
    expect(terms.quantity).toEqual({ amount: '2', unit: 'tonne' });
    expect(terms.price).toEqual({
      amount: '3',
      currency: 'GCU',
      perUnit: 'tonne',
    });
    expect(terms.requiredSignatures).toHaveLength(3);
    const command = transferCommand();
    const { seller, buyer } = transferProposals();
    expect(seller.countryId).not.toBe(buyer.countryId);
    expect(seller.requiredOffices).toEqual(['TRADE']);
    expect(buyer.requiredOffices).toEqual(['TRADE', 'FINANCE']);
    expect(seller.payloadFingerprint).toBe(command.fingerprint);
    expect(buyer.payloadFingerprint).toBe(command.fingerprint);
  });

  it.each([
    { quantity: { amount: '3', unit: 'tonne' } },
    { price: { amount: '4', currency: 'GCU', perUnit: 'tonne' } },
    { buyerCountryId: 'COUNTRY_OTHER_TEST' },
    { paymentSource: 'OFFICIAL_RESERVES_TEST' },
    { policyVersion: 'TEST_ONLY_POLICY_V2' },
    { requiredSignatures: transferTerms().requiredSignatures.slice(0, 2) },
  ])('changed terms produce a conflicting intent: %j', (patch) => {
    const original = transferCommand();
    const changed = transferCommand({ ...transferTerms(), ...patch });
    expect(changed.fingerprint).not.toBe(original.fingerprint);
    expect(() => classifyCommandIdentity([original], changed)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      }),
    );
  });

  it('a lost-response retry may change audit fields but is an exact duplicate', () => {
    const original = transferCommand();
    const retry = parseCanonicalCommand(
      {
        ...transferInput(),
        correlationId: 'CORRELATION_RETRY_TEST',
        submittedAtReal: '2026-09-12T00:00:02.000Z',
      },
      sha256,
    );
    expect(classifyCommandIdentity([original], retry).kind).toBe(
      'EXACT_DUPLICATE',
    );
  });

  it('changing the expected version requires a new intent rather than retrying the same key', () => {
    const original = transferCommand();
    const staleRevision = parseCanonicalCommand(
      { ...transferInput(), expectedWorldVersion: '1' },
      sha256,
    );
    expect(() =>
      classifyCommandIdentity([original], staleRevision),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      }),
    );
  });

  it('one person holding two buyer Offices must sign twice and cannot duplicate an Office', async () => {
    const { buyer } = transferProposals();
    const user = await signer(buyer);
    const trade = await user.context('TRADE');
    const finance = await user.context('FINANCE');
    const pending = await sign(buyer, trade);
    expect(pending.status).toBe('PENDING');
    await expect(sign(pending, trade)).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
    });
    const approved = await sign(pending, finance);
    expect(approved.status).toBe('APPROVED');
    expect(approved.signatures.map((s) => s.officeId)).toEqual([
      'TRADE',
      'FINANCE',
    ]);
    expect(approved.signatures[0]?.authSubject).toBe(
      approved.signatures[1]?.authSubject,
    );
  });

  it('Seller Trade authority cannot sign the Buyer Trade proposal', async () => {
    const { seller, buyer } = transferProposals();
    const sellerUser = await signer(seller);
    await expect(
      sign(buyer, await sellerUser.context('TRADE')),
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
    });
    expect(buyer.signatures).toHaveLength(0);
  });

  it.each([
    { active: false },
    { suspended: true },
    { authorizationVersion: 'AUTH_V2' },
    { officeAssignments: [officeId('FINANCE')] },
  ])(
    'reauthorizes before signing after membership changes: %j',
    async (patch) => {
      const { buyer } = transferProposals();
      const user = await signer(buyer);
      const context = await user.context('TRADE');
      user.change(patch);
      await expect(sign(buyer, context)).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      });
      expect(buyer.signatures).toHaveLength(0);
    },
  );

  it.each(['payload', 'policy', 'requiredOffices'] as const)(
    'an issued context cannot authorize changed %s',
    async (field) => {
      const { buyer } = transferProposals();
      const user = await signer(buyer);
      const context = await user.context('TRADE');
      const changed: ApprovalProposal = {
        ...buyer,
        ...(field === 'payload'
          ? {
              payloadFingerprint: transferCommand({
                ...transferTerms(),
                quantity: { amount: '3', unit: 'tonne' },
              }).fingerprint,
            }
          : field === 'policy'
            ? { policyVersion: 'TEST_ONLY_POLICY_V2' }
            : { requiredOffices: [officeId('TRADE')] }),
      };
      await expect(sign(changed, context)).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      });
    },
  );
});
