import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  Money,
  Quantity,
  authorizeOfficeCapability,
  isAuthorizedOfficeContext,
} from '@econmind/core';
import {
  transferCommand,
  transferProposals,
  transferTerms,
} from '../preparation/v10-transfer-contract.js';
import {
  V10_TWO_COUNTRY_TEST_FIXTURE_STATUS,
  createV10AtomicCommandFixture,
  createV10TwoCountryTestFixture,
} from './v10-two-country-fixture.js';

function amount(value: Money | Quantity): string {
  return value.toCanonicalValue().amount;
}

describe('V10.1 two-country fixture preparation', () => {
  it('builds one explicitly test-only two-country World at version zero', () => {
    const fixture = createV10TwoCountryTestFixture();
    expect(fixture).toMatchObject({
      status: V10_TWO_COUNTRY_TEST_FIXTURE_STATUS,
      productionFallback: false,
      calibrationCountryValuesUsed: false,
      worldId: 'WORLD_TRANSFER_TEST',
      openingWorldVersion: '0',
      countries: {
        seller: 'COUNTRY_SELLER_TEST',
        buyer: 'COUNTRY_BUYER_TEST',
      },
      commodity: {
        id: 'GRAIN',
        unit: 'tonne',
        registrySourceDocument: 'MASTER',
      },
    });
    expect(new Set(Object.values(fixture.countries)).size).toBe(2);
    expect(fixture.openingSeed.worldId).toBe(fixture.worldId);
    expect(fixture.rebuiltLedgers.worldVersion).toBe('0');
    expect(fixture.rebuiltLedgers.inventory.worldVersion).toBe('0');
    expect(fixture.rebuiltLedgers.financial.worldVersion).toBe('0');
    expect(fixture.openingSeed.sources).toHaveLength(1);
    expect(fixture.openingSeed.sources[0]).toMatchObject({
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/support/v10-two-country-fixture.ts',
    });
    expect(fixture.openingSeed.sources[0]?.canonicalPayload).toContain(
      '"calibrationCountryValuesUsed":false',
    );
  });

  it('reconstructs balanced opening inventory and finance with exact values', () => {
    const fixture = createV10TwoCountryTestFixture();
    const inventory = fixture.rebuiltLedgers.inventory.balances;
    expect(inventory).toHaveLength(1);
    expect(inventory[0]?.account).toEqual(
      fixture.inventoryAccounts.sellerAvailable,
    );
    expect(inventory[0] && amount(inventory[0].quantity)).toBe('4');
    const positions = new Map(
      fixture.rebuiltLedgers.financial.positions.map((position) => [
        position.account.accountId,
        amount(position.netDebitBalance),
      ]),
    );
    expect(positions).toEqual(
      new Map([
        [fixture.financialAccounts.sellerSettlement.accountId, '2'],
        [fixture.financialAccounts.sellerOpeningEquity.accountId, '-2'],
        [fixture.financialAccounts.buyerTreasury.accountId, '8'],
        [fixture.financialAccounts.buyerOpeningEquity.accountId, '-8'],
      ]),
    );
    expect(
      fixture.rebuiltLedgers.financial.positions
        .map(({ netDebitBalance }) => netDebitBalance)
        .reduce((total, next) => total.add(next), Money.from('0', 'GCU'))
        .toCanonicalValue().amount,
    ).toBe('0');
    expect(fixture.reconciliation).toMatchObject({
      reconciled: true,
      inventory: { status: 'MATCH' },
      financial: { status: 'MATCH' },
    });
    expect(
      Money.from(
        positions.get(fixture.financialAccounts.buyerTreasury.accountId)!,
        'GCU',
      )
        .subtract(fixture.transferIntent.settlementAmount)
        .toCanonicalValue().amount,
    ).toBe('2');
    expect(
      inventory[0]!.quantity
        .subtract(fixture.transferIntent.quantity)
        .toCanonicalValue().amount,
    ).toBe('2');
  });

  it('publishes exact conserved movement and payment plans for later tests', () => {
    const fixture = createV10TwoCountryTestFixture();
    for (const movement of Object.values(fixture.movementPlan)) {
      expect(movement.map(({ delta }) => amount(delta))).toEqual(['-2', '2']);
      expect(
        movement[0].delta.add(movement[1].delta).toCanonicalValue().amount,
      ).toBe('0');
      expect(
        movement.every(({ account }) => account.worldId === fixture.worldId),
      ).toBe(true);
      expect(
        movement.every(
          ({ account }) => account.commodityId === fixture.commodity.id,
        ),
      ).toBe(true);
    }
    expect(
      fixture.movementPlan.reserve.map(({ account }) => account.bucket),
    ).toEqual(['AVAILABLE', 'RESERVED']);
    expect(
      fixture.movementPlan.ship.map(({ account }) => account.bucket),
    ).toEqual(['RESERVED', 'IN_TRANSIT']);
    expect(
      fixture.movementPlan.deliver.map(({ account }) => account.bucket),
    ).toEqual(['IN_TRANSIT', 'AVAILABLE']);
    expect(fixture.inventoryAccounts.sellerInTransit.titleHolderId).toBe(
      fixture.entities.sellerTreasury,
    );
    expect(fixture.inventoryAccounts.buyerAvailable.titleHolderId).toBe(
      fixture.entities.buyerTreasury,
    );
    expect(
      fixture.paymentPlan.map(({ direction, amount: value }) => [
        direction,
        amount(value),
      ]),
    ).toEqual([
      ['CREDIT', '6'],
      ['DEBIT', '6'],
    ]);
    expect(
      fixture.paymentPlan[0].amount
        .subtract(fixture.paymentPlan[1].amount)
        .toCanonicalValue().amount,
    ).toBe('0');
  });

  it('is deterministic and carries one canonical command identity', () => {
    const first = createV10TwoCountryTestFixture();
    const second = createV10TwoCountryTestFixture();
    expect(second.openingSeed.fingerprint).toBe(first.openingSeed.fingerprint);
    expect(second.command.fingerprint).toBe(first.command.fingerprint);
    expect(second.command.commandId).toBe('COMMAND_TRANSFER_TEST');
    expect(second.command.expectedWorldVersion).toBe('0');
    expect(second.command.canonicalPayload).toContain(
      '"policyVersion":"TEST_ONLY_UNAPPROVED_V10_TREASURY_V1"',
    );
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.openingSeed)).toBe(true);
  });

  it('authorizes the three declared Office/country positive cases', async () => {
    const fixture = createV10TwoCountryTestFixture();
    const allowed = fixture.authorizationCases.filter(
      ({ expected }) => expected === 'ALLOW',
    );
    expect(allowed).toHaveLength(3);
    for (const testCase of allowed) {
      const actor = fixture.officeActors[testCase.actorKey];
      const context = await authorizeOfficeCapability({
        principal: actor.principal,
        resolver: actor.resolver,
        worldId: fixture.worldId,
        requestedCountryId: testCase.requestedCountryId,
        requestedOfficeId: testCase.requestedOfficeId,
        capability: testCase.capability,
      });
      expect(isAuthorizedOfficeContext(context)).toBe(true);
      expect(context).toMatchObject({
        worldId: fixture.worldId,
        countryId: testCase.requestedCountryId,
        officeId: testCase.requestedOfficeId,
        capability: testCase.capability,
      });
    }
  });

  it('fails closed for wrong-country and unassigned-Office negative cases', async () => {
    const fixture = createV10TwoCountryTestFixture();
    const denied = fixture.authorizationCases.filter(
      ({ expected }) => expected === 'DENY',
    );
    expect(denied).toHaveLength(2);
    for (const testCase of denied) {
      const actor = fixture.officeActors[testCase.actorKey];
      await expect(
        authorizeOfficeCapability({
          principal: actor.principal,
          resolver: actor.resolver,
          worldId: fixture.worldId,
          requestedCountryId: testCase.requestedCountryId,
          requestedOfficeId: testCase.requestedOfficeId,
          capability: testCase.capability,
        }),
      ).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      });
    }
  });

  it('adapts directly to the F atomic harness shape without numeric coercion', async () => {
    const fixture = createV10TwoCountryTestFixture();
    const atomic = await createV10AtomicCommandFixture(fixture);
    expect(atomic).toMatchObject({
      worldId: 'WORLD_TRANSFER_TEST',
      commandId: 'COMMAND_TRANSFER_TEST',
      idempotencyKey: 'IDEMPOTENCY_TRANSFER_TEST',
      expectedWorldVersion: '0',
      holderId: 'WORKER_V10_TEST_ONLY',
      fencingToken: '1',
      expectedAuthorizationRevision: 'AUTH_V10_SELLER_TRADE_1',
      requiredCountryId: 'COUNTRY_SELLER_TEST',
      requiredOfficeId: 'TRADE',
      requiredCapability: 'TRADE_CONTRACTS',
      inventoryAmount: '2',
      financialAmount: '6',
    });
    expect(atomic.commandFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(isAuthorizedOfficeContext(atomic.authorizationContext)).toBe(true);
    expect(typeof atomic.inventoryAmount).toBe('string');
    expect(typeof atomic.financialAmount).toBe('string');
  });

  it('jointly reconciles the O transfer contract with C opening and Office facts', () => {
    const fixture = createV10TwoCountryTestFixture();
    const contractCommand = transferCommand();
    const contractProposals = transferProposals();
    expect(fixture.transferIntent.terms).toEqual(transferTerms());
    expect(fixture.command.fingerprint).toBe(contractCommand.fingerprint);
    expect(fixture.proposals).toEqual(contractProposals);
    expect(fixture.decisionScopes.seller).toMatchObject({
      worldId: fixture.worldId,
      countryId: fixture.countries.seller,
      payloadFingerprint: fixture.command.fingerprint,
      requiredOffices: ['TRADE'],
    });
    expect(fixture.decisionScopes.buyer).toMatchObject({
      worldId: fixture.worldId,
      countryId: fixture.countries.buyer,
      payloadFingerprint: fixture.command.fingerprint,
      requiredOffices: ['TRADE', 'FINANCE'],
    });
    expect(
      fixture.transferIntent.price.multiply(fixture.transferIntent.quantity),
    ).toEqual(fixture.transferIntent.settlementAmount);
    expect(fixture.transferIntent.settlementAmount.toCanonicalValue()).toEqual({
      amount: '6',
      currency: 'GCU',
    });
    expect(fixture.officeActors.buyerTrade.principal.authSubject).toBe(
      fixture.officeActors.buyerFinance.principal.authSubject,
    );
    expect(
      fixture.officeActors.buyerFinance.membership.officeAssignments,
    ).toEqual(['TRADE', 'FINANCE']);
    expect(fixture.openingSeed.sources[0]?.canonicalPayload).toContain(
      fixture.command.fingerprint,
    );
  });
});
