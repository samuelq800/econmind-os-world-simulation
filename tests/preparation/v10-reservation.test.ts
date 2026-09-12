import { describe, expect, it } from 'vitest';

import {
  OFFICE_APPROVAL_CAPABILITY,
  authorizeOfficeCapability,
  canonicalSerialize,
  createApprovalProposal,
  parseCanonicalCommand,
  signApprovalProposal,
  type CanonicalCommand,
  type MembershipSnapshot,
} from '../../packages/core/src/index.js';
import {
  prepareGoodsReservation,
  type GoodsReservationApproval,
  type GoodsReservationInput,
} from '../../apps/world-worker/src/trade/goods-reservation.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';
import {
  decisionScope,
  sha256,
  transferInput,
  transferTerms,
} from './v10-transfer-contract.js';

async function setup(command?: CanonicalCommand) {
  const fixture = createV10TwoCountryTestFixture();
  const intent = command ?? fixture.command;
  const patches: Record<string, Partial<MembershipSnapshot>> = {};
  const actors = Object.fromEntries(
    Object.entries(fixture.officeActors).map(([key, actor]) => [
      key,
      {
        ...actor,
        resolver: {
          ...actor.resolver,
          async resolveCurrentMembership() {
            return { ...actor.membership, ...patches[key] };
          },
        },
      },
    ]),
  );
  const approvals: GoodsReservationApproval[] = [];
  for (const [side, keys] of [
    ['seller', ['sellerTrade']],
    ['buyer', ['buyerTrade', 'buyerFinance']],
  ] as const) {
    const original = fixture.proposals[side];
    let proposal = createApprovalProposal({
      id: original.id,
      version: original.version,
      worldId: original.worldId,
      countryId: original.countryId,
      payloadFingerprint: intent.fingerprint,
      resolution: {
        policyVersion: original.policyVersion,
        requiredOffices: original.requiredOffices,
      },
    });
    const contexts = [];
    for (const key of keys) {
      const actor = actors[key]!;
      const context = await authorizeOfficeCapability({
        principal: actor.principal,
        resolver: actor.resolver,
        worldId: fixture.worldId,
        requestedCountryId: actor.membership.countryId,
        requestedOfficeId: actor.officeId,
        capability: OFFICE_APPROVAL_CAPABILITY,
        decisionScope: decisionScope(proposal),
      });
      contexts.push(context);
      proposal = await signApprovalProposal({
        proposal,
        context,
        actorId: actor.actorId,
        expectedVersion: proposal.version,
        signedAt: '2026-09-12T00:00:01.000Z',
      });
    }
    approvals.push({ proposal, contexts });
  }
  const seller = actors.sellerTrade!;
  const commandContext = await authorizeOfficeCapability({
    principal: seller.principal,
    resolver: seller.resolver,
    worldId: fixture.worldId,
    requestedCountryId: seller.membership.countryId,
    requestedOfficeId: seller.officeId,
    capability: 'TRADE_CONTRACTS',
  });
  const input: GoodsReservationInput = {
    command: intent,
    seed: fixture.openingSeed,
    lineage: [],
    source: fixture.inventoryAccounts.sellerAvailable,
    commandContext,
    policy: {
      policyVersion: fixture.proposals.seller.policyVersion,
      approvalRecord: 'TEST_ONLY_POLICY_APPROVAL_NOT_ADR09',
      requiredSignatures: fixture.transferIntent.terms.requiredSignatures.map(
        (item) => ({
          countryId: item.countryId as typeof fixture.countries.seller,
          officeId: item.officeId as typeof seller.officeId,
        }),
      ),
    },
    approvals,
    recordedAtReal: '2026-09-12T00:00:02.000Z',
    sha256Hex: sha256,
  };
  return { input, fixture, patches };
}

describe('V10.2 actual Worker reservation candidate', () => {
  it('moves exactly 2 of 4 tonnes to RESERVED, with unchanged money/title/risk/location', async () => {
    const { input, fixture } = await setup();
    const result = await prepareGoodsReservation(input);
    expect(result.status).toBe('CANDIDATE_NOT_COMMITTED');
    expect(
      result.nextLedgers.inventory.balances
        .map((item) => [
          item.account.bucket,
          item.quantity.toCanonicalValue().amount,
        ])
        .sort(),
    ).toEqual([
      ['AVAILABLE', '2'],
      ['RESERVED', '2'],
    ]);
    expect(
      result.nextLedgers.inventory.balances.some(
        (item) => item.account.countryId === fixture.countries.buyer,
      ),
    ).toBe(false);
    expect(result.reserved).toEqual({
      ...input.source,
      bucket: 'RESERVED',
      reservationId: result.reserved.reservationId,
    });
    expect(result.settlementAmount.toCanonicalValue()).toEqual({
      amount: '6',
      currency: 'GCU',
    });
    expect(canonicalSerialize(result.nextLedgers.financial.positions)).toBe(
      canonicalSerialize(fixture.rebuiltLedgers.financial.positions),
    );
    expect(
      fixture.rebuiltLedgers.inventory.balances[0]!.quantity.toCanonicalValue()
        .amount,
    ).toBe('4');
    expect(result.ledgerTransition.financialPostingBatches).toEqual([]);
  });

  it('has no policy fallback when ADR-09 is unapproved', async () => {
    const { input } = await setup();
    await expect(
      prepareGoodsReservation({ ...input, policy: null }),
    ).rejects.toThrow('server-approved');
  });

  it('rejects insufficient inventory without changing the opening state', async () => {
    const command = parseCanonicalCommand(
      transferInput({
        ...transferTerms(),
        quantity: { amount: '5', unit: 'tonne' },
      }),
      sha256,
    );
    const { input, fixture } = await setup(command);
    await expect(prepareGoodsReservation(input)).rejects.toMatchObject({
      code: 'INVENTORY_NEGATIVE_STOCK',
    });
    expect(fixture.rebuiltLedgers.inventory.worldVersion).toBe('0');
  });

  it.each([
    ['buyerFinance', { active: false }],
    ['buyerTrade', { suspended: true }],
    ['buyerFinance', { authorizationVersion: 'CHANGED' }],
    ['sellerTrade', { officeAssignments: [] }],
  ] as const)('rejects current authorization change %s', async (key, patch) => {
    const { input, patches } = await setup();
    patches[key] = patch;
    await expect(prepareGoodsReservation(input)).rejects.toMatchObject({
      code: 'AUTHORIZATION_DENIED',
    });
  });

  it('does not accept an unsigned Finance slot even if proposal status says APPROVED', async () => {
    const { input } = await setup();
    const buyer = input.approvals[1]!;
    await expect(
      prepareGoodsReservation({
        ...input,
        approvals: [
          input.approvals[0]!,
          {
            ...buyer,
            proposal: {
              ...buyer.proposal,
              signatures: buyer.proposal.signatures.slice(0, 1),
            },
          },
        ],
      }),
    ).rejects.toThrow('incomplete');
  });

  it('rejects a proposal tied to another command fingerprint', async () => {
    const { input } = await setup();
    const seller = input.approvals[0]!;
    await expect(
      prepareGoodsReservation({
        ...input,
        approvals: [
          {
            ...seller,
            proposal: {
              ...seller.proposal,
              payloadFingerprint: `sha256:${'0'.repeat(64)}`,
            },
          },
          input.approvals[1]!,
        ],
      }),
    ).rejects.toThrow('not bound');
  });

  it('rejects stale WorldVersion before constructing another posting', async () => {
    const command = parseCanonicalCommand(
      { ...transferInput(), expectedWorldVersion: '1' },
      sha256,
    );
    const { input } = await setup(command);
    await expect(prepareGoodsReservation(input)).rejects.toMatchObject({
      code: 'VERSION_MISMATCH',
    });
  });

  it('rejects duplicate reservation and same-key different terms', async () => {
    const { input } = await setup();
    const first = await prepareGoodsReservation(input);
    await expect(
      prepareGoodsReservation({ ...input, lineage: [first.ledgerTransition] }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const changed = await setup(
      parseCanonicalCommand(
        transferInput({
          ...transferTerms(),
          price: { amount: '4', currency: 'GCU', perUnit: 'tonne' },
        }),
        sha256,
      ),
    );
    await expect(
      prepareGoodsReservation({
        ...changed.input,
        lineage: [first.ledgerTransition],
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rejects buyer or foreign inventory source', async () => {
    const { input, fixture } = await setup();
    await expect(
      prepareGoodsReservation({
        ...input,
        source: fixture.inventoryAccounts.buyerAvailable,
      }),
    ).rejects.toThrow('seller available');
  });
});
