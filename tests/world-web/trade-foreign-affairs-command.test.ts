import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const tradeCommand = readFileSync(
  'apps/world-web/src/prototype/TradeForeignAffairsCommand.tsx',
  'utf8',
);
const g01 = readFileSync(
  'apps/world-web/src/prototype/SixOfficesG01.tsx',
  'utf8',
);
const styles = readFileSync(
  'apps/world-web/src/prototype/six-offices.css',
  'utf8',
);

describe('Trade and Foreign Affairs corridor command surface', () => {
  it('turns a supply shortage into a playable foreign-route loop', () => {
    for (const label of [
      'Keep the corridor alive.',
      'The clock is in the cargo.',
      'Semiconductor bridge',
      'Read shortage',
      'Open offers',
      'Build route',
      'Verify arrival',
      'Record route',
      'Read semiconductor corridor',
      'Open partner offer board',
      'Open counteroffer review',
      'Record local corridor route',
      'Open next foreign desk',
    ]) {
      expect(tradeCommand).toContain(label);
    }
    expect(tradeCommand).toContain('Every port makes a different promise.');
    expect(tradeCommand).toContain(
      'Industry reads the need; Trade negotiates the',
    );
    expect(tradeCommand).toContain('external terms and route.');
  });

  it('uses concrete cargo, landed cost, tariff, quota, and delivery constraints', () => {
    expect(tradeCommand).toContain('Standardised semiconductor units');
    expect(tradeCommand).toContain('Tarsis Union');
    expect(tradeCommand).toContain('Meridian Compact');
    expect(tradeCommand).toContain('Aster Republic');
    expect(tradeCommand).toContain('tariffRate');
    expect(tradeCommand).toContain('landedCost');
    expect(tradeCommand).toContain('QUOTA_REMAINING');
    expect(tradeCommand).toContain('arrivalDay > routeCoverageAtArrival');
    expect(tradeCommand).toContain('count only after a delivery is confirmed');
    expect(tradeCommand).toContain('does not draw official reserves.');
  });

  it('blocks a late, concentrated, short, or over-quota corridor and offers recovery', () => {
    expect(tradeCommand).toContain('Route cannot be sent yet.');
    expect(tradeCommand).toContain(
      "after the route's available cover runs out.",
    );
    expect(tradeCommand).toContain('exceeds the remaining import quota.');
    expect(tradeCommand).toContain('One port is not enough for a critical');
    expect(tradeCommand).toContain('Rebuild the two-port route');
    expect(tradeCommand).toContain(
      "setSelectedOfferIds(['TARSIS_FAST', 'MERIDIAN_STABLE'])",
    );
    expect(tradeCommand).toContain('routeHasEnoughGoods && routeIsDiversified');
    expect(tradeCommand).toContain('quotaAvailable && !lateOffer');
  });

  it('keeps foreign trade drafts local and does not invent abstract relationship controls', () => {
    expect(tradeCommand).toContain(
      'No order, shipment, FX payment, tariff receipt, or contract was submitted.',
    );
    expect(tradeCommand).toContain('negotiation, or contract is submitted.');
    expect(tradeCommand).toContain('No world state changed.');
    expect(tradeCommand).not.toContain('fetch(');
    expect(tradeCommand).not.toContain('submitCommand');
    expect(tradeCommand).not.toContain('@econmind/core');
    expect(tradeCommand).not.toContain('supabase');
    expect(tradeCommand).not.toContain('Trade Strength');
    expect(tradeCommand).not.toContain('Friendship');
  });

  it('routes Trade to its own desk and follows the existing World interaction system', () => {
    expect(g01).toContain('import { TradeForeignAffairsCommand }');
    expect(g01).toContain('TRADE_NAV_GROUPS');
    expect(g01).toContain("actingOffice.officeId === 'TRADE'");
    expect(g01).toContain('<TradeForeignAffairsCommand');
    expect(g01).toContain('<FinanceMinisterCommand');
    expect(g01).toContain('<CentralBankGovernor');
    expect(g01).toContain('<LivingNationScene');
    expect(styles).toContain('.trade-command');
    expect(styles).toContain('.trade-corridor__map');
    expect(styles).toContain('.trade-offer-card');
    expect(styles).toContain('.trade-publish-review');
    expect(styles).toContain('.trade-button:focus-visible');
    expect(styles).toContain('(prefers-reduced-motion: reduce)');
  });
});
