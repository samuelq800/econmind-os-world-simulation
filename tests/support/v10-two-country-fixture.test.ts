import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  Money,
  Quantity,
  authorizeOfficeCapability,
  isAuthorizedOfficeContext,
} from '../../packages/core/src/index.js';
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
      worldId: 'WORLD_V10_TEST_ONLY',
      openingWorldVersion: '0',
      countries: {
        seller: 'COUNTRY_V10_ALPHA',
        buyer: 'COUNTRY_V10_BETA',
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
    expect(inventory[0] && amount(inventory[0].quantity)).toBe('12');
    const positions = new Map(
      fixture.rebuiltLedgers.financial.positions.map((position) => [
        position.account.accountId,
        amount(position.netDebitBalance),
      ]),
    );
    expect(positions).toEqual(
      new Map([
        [fixture.financialAccounts.sellerSettlement.accountId, '20'],
        [fixture.financialAccounts.sellerOpeningEquity.accountId, '-20'],
        [fixture.financialAccounts.buyerTreasury.accountId, '100'],
        [fixture.financialAccounts.buyerOpeningEquity.accountId, '-100'],
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
    ).toBe('92');
    expect(
      inventory[0]!.quantity
        .subtract(fixture.transferIntent.quantity)
        .toCanonicalValue().amount,
    ).toBe('8');
  });

  it('publishes exact conserved movement and payment plans for later tests', () => {
    const fixture = createV10TwoCountryTestFixture();
    for (const movement of Object.values(fixture.movementPlan)) {
      expect(movement.map(({ delta }) => amount(delta))).toEqual(['-4', '4']);
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
      ['CREDIT', '8'],
      ['DEBIT', '8'],
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
    expect(second.command.commandId).toBe('COMMAND_V10_TEST_TRANSFER');
    expect(second.command.expectedWorldVersion).toBe('0');
    expect(second.command.canonicalPayload).toContain(
      '"status":"TEST_ONLY_NON_AUTHORITATIVE"',
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

  it('fails closed for wrong-country and wrong-Office negative cases', async () => {
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
      worldId: 'WORLD_V10_TEST_ONLY',
      commandId: 'COMMAND_V10_TEST_TRANSFER',
      idempotencyKey: 'IDEMPOTENCY_V10_TEST_TRANSFER',
      expectedWorldVersion: '0',
      holderId: 'WORKER_V10_TEST_ONLY',
      fencingToken: '1',
      expectedAuthorizationRevision: 'AUTH_V10_ALPHA_TRADE_1',
      requiredCountryId: 'COUNTRY_V10_ALPHA',
      requiredOfficeId: 'TRADE',
      requiredCapability: 'TRADE_CONTRACTS',
      inventoryAmount: '4',
      financialAmount: '8',
    });
    expect(atomic.commandFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(isAuthorizedOfficeContext(atomic.authorizationContext)).toBe(true);
    expect(typeof atomic.inventoryAmount).toBe('string');
    expect(typeof atomic.financialAmount).toBe('string');
  });
});
