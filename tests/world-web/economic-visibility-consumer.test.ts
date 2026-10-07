import { describe, expect, it } from 'vitest';
import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import {
  consumeOfficeProjection,
  economicAvailabilityMessages,
  type OfficeRole,
} from '../../apps/world-web/src/office-projection/model.js';
import { officeProjectionFixture } from './office-projection-fixture.js';

const requestId = '11111111-1111-4111-8111-111111111111';
describe('economic visibility presentation / OFFLINE TEST_ONLY', () => {
  it.each(['missing', 'denied', 'country'] as const)(
    '%s does not disclose cached private movements or convert absence to zero',
    async (mode) => {
      const f = officeProjectionFixture('finance');
      const ledger = f.payload.ledger as unknown as Record<string, unknown>;
      if (mode === 'missing') delete ledger.visibility;
      else
        ledger.visibility = {
          schemaVersion: 'economic-read-visibility-v1',
          financialDetail:
            mode === 'country' ? 'AUTHORIZED_FILTERED' : 'NOT_AUTHORIZED',
          inventoryDetail: 'NOT_AUTHORIZED',
          countrySummary: 'NOT_AUTHORIZED',
        };
      if (mode === 'country')
        Object.assign(f.config.identity, { classification: 'COUNTRY' });
      // Deliberately simulate a tainted / legacy cache, not a valid new publisher.
      f.payload.ledger.inventoryPositions.push({
        bucket: 'RESERVED',
        commodityId: 'TEST_STEEL',
        quantity: '-0.125',
        unit: 'tonne',
      });
      const port = f.client();
      const model = consumeOfficeProjection(
        await port.readProjection(requestId),
        f.config,
        'finance',
      );
      expect(model.kind).toBe('CURRENT');
      if (model.kind !== 'CURRENT') throw new Error(model.code);
      expect(model.readouts).toHaveLength(1);
      expect(JSON.stringify(model)).not.toContain('9007199254740993.25');
      expect(JSON.stringify(model)).not.toContain('-0.125');
      expect(model).toMatchObject({
        economicAvailability: {
          financial: mode === 'missing' ? 'UNAVAILABLE' : 'NOT_AUTHORIZED',
          inventory: mode === 'missing' ? 'UNAVAILABLE' : 'NOT_AUTHORIZED',
        },
      });
      port.disconnect();
    },
  );
  it.each(['finance', 'central_bank'] as OfficeRole[])(
    '%s preserves exact server-filtered movements, source head and no opening-balance claim',
    async (role) => {
      const f = officeProjectionFixture(role),
        port = f.client();
      const model = consumeOfficeProjection(
        await port.readProjection(requestId),
        f.config,
        role,
      );
      if (model.kind !== 'CURRENT') throw new Error(model.code);
      expect(model.readouts[1]).toMatchObject({
        canonicalValue: '9007199254740993.25',
        unit: 'GCU',
        nature: 'NET_POSTING_MOVEMENT',
      });
      expect(model.head).toMatchObject({
        worldVersion: '2',
        eventSequence: '2',
        seatRef: 'TEST_SEAT',
      });
      expect(model.readouts).toHaveLength(2);
      expect(
        economicAvailabilityMessages(model.economicAvailability),
      ).toContain('Inventory movements · NOT_AUTHORIZED');
      port.disconnect();
    },
  );
  it.each(['captain', 'trade', 'industry', 'social'] as OfficeRole[])(
    '%s cannot turn a marker or content hash into a private financial grant',
    async (role) => {
      const f = officeProjectionFixture(role),
        port = f.client();
      f.payload.ledger.visibility.financialDetail = 'AUTHORIZED_FILTERED';
      f.payload.ledger.financialPositions.push({
        accountId: 'TEST_PRIVATE',
        accountClass: 'TREASURY',
        currency: 'GCU',
        netDebitBalance: '123.75',
      });
      const model = consumeOfficeProjection(
        await port.readProjection(requestId),
        f.config,
        role,
      );
      if (model.kind !== 'CURRENT') throw new Error(model.code);
      expect(model.economicAvailability.financial).toBe('NOT_AUTHORIZED');
      expect(model.readouts).toHaveLength(1);
      expect(JSON.stringify(model)).not.toContain('TEST_PRIVATE');
      port.disconnect();
    },
  );
  it.each(['partial', 'unknown', 'inventory-grant'] as const)(
    '%s carrier leaves detail unavailable without a tolerant fallback',
    async (mode) => {
      const f = officeProjectionFixture('finance'),
        port = f.client();
      const visibility = f.payload.ledger.visibility as unknown as Record<
        string,
        unknown
      >;
      if (mode === 'partial') delete visibility.countrySummary;
      if (mode === 'unknown')
        visibility.schemaVersion = 'economic-read-visibility-v999';
      if (mode === 'inventory-grant')
        visibility.inventoryDetail = 'AUTHORIZED_FILTERED';
      const model = consumeOfficeProjection(
        await port.readProjection(requestId),
        f.config,
        'finance',
      );
      if (model.kind !== 'CURRENT') throw new Error(model.code);
      expect(model.economicAvailability.financial).toBe('UNAVAILABLE');
      expect(model.readouts).toHaveLength(1);
      expect(
        economicAvailabilityMessages(model.economicAvailability).join('\n'),
      ).toContain('ECONOMIC_VISIBILITY_UNAVAILABLE');
      port.disconnect();
    },
  );
  it('authorized empty arrays are absent movement entries, never a zero balance', async () => {
    const f = officeProjectionFixture('finance'),
      port = f.client();
    f.payload.ledger.financialPositions = [];
    const model = consumeOfficeProjection(
      await port.readProjection(requestId),
      f.config,
      'finance',
    );
    if (model.kind !== 'CURRENT') throw new Error(model.code);
    expect(model.economicAvailability.financial).toBe('AVAILABLE');
    expect(model.readouts).toHaveLength(1);
    expect(model.readouts.every((x) => x.nature === 'ACTIVITY_COUNT')).toBe(
      true,
    );
    port.disconnect();
  });
  it('a newly denied carrier clears earlier details while preserving original FINAL and refreshed head', async () => {
    const f = officeProjectionFixture('finance');
    const c = createOfficeProjectionController(
      f.binding,
      () => f.binding.view,
      () => f.client(),
      () => requestId,
    );
    await c.refresh();
    expect(c.getState().model?.readouts[1]?.canonicalValue).toBe(
      '9007199254740993.25',
    );
    f.payload.ledger.visibility.financialDetail = 'NOT_AUTHORIZED';
    await c.lookupAndRefresh();
    expect(c.getState()).toMatchObject({
      status: 'CURRENT',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '3' },
      model: {
        head: { worldVersion: '3' },
        economicAvailability: { financial: 'NOT_AUTHORIZED' },
      },
    });
    expect(c.getState().model?.readouts).toHaveLength(1);
    expect(JSON.stringify(c.getState())).not.toContain('9007199254740993.25');
    c.disconnect();
  });
});
