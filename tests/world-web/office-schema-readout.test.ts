import { describe, expect, it } from 'vitest';
import {
  consumeOfficeProjection,
  officeProjectionRoles,
  type OfficeRole,
} from '../../apps/world-web/src/office-projection/model.js';
import { renderOfficeReadout } from '../../apps/world-web/src/office-projection/readout-view.js';
import { currentFinancialPositionFixture } from './current-financial-position-fixture.js';
import { HostDocument } from './trusted-host-dom.js';

// OFFLINE TEST_ONLY wire values through the shipped client/parser/renderer.
// No formal source, actual seat/admission or six-Office E2E is claimed.
async function read(role: OfficeRole) {
  const f = currentFinancialPositionFixture(role);
  const client = f.client();
  const result = await client.readProjection(
    '11111111-1111-4111-8111-111111111111',
  );
  const model = consumeOfficeProjection(result, f.config, role);
  client.disconnect();
  if (model.kind !== 'CURRENT') throw Error(model.code);
  return { f, model };
}

describe('schema-bound exact Office readout display', () => {
  it.each(Object.keys(officeProjectionRoles) as OfficeRole[])(
    'retains actual parsed fields and provenance for %s without filling role gaps',
    async (role) => {
      const { model } = await read(role);
      const doc = new HostDocument(role);
      const element = renderOfficeReadout(doc as unknown as Document, model);
      expect(element.textContent).toContain('Recorded authoritative events');
      expect(element.textContent).toContain('1 events');
      expect(element.textContent).toContain('World v2 / event 2');
      expect(element.textContent).toContain('DERIVED_SERVER_PROJECTION');
      for (const value of Object.values(model.head))
        expect(element.textContent).toContain(value);
      for (const field of model.readouts)
        expect(element.textContent).toContain(
          `${field.canonicalValue} ${field.unit}`,
        );
      if (role === 'finance' || role === 'central_bank') {
        expect(element.textContent).toContain(
          'Opening + posted entries · Not spendable funds',
        );
        expect(element.textContent).toContain('NONZERO_LEDGER_POSITIONS');
      } else {
        expect(element.textContent).toContain('NOT_AUTHORIZED');
        expect(element.textContent).not.toContain('TEST_CB_ACCOUNT');
        expect(element.textContent).not.toContain('TEST_TREASURY');
      }
      expect(element.textContent).not.toContain('0 GCU');
    },
  );

  it.each(['finance', 'central_bank'] as const)(
    'preserves signed high-precision LNY and GCU separately for %s',
    async (role) => {
      const f = currentFinancialPositionFixture(role);
      const carrier = f.getCarrier();
      carrier.positions = [
        {
          accountId: 'TEST_EXACT',
          accountClass: 'CASH',
          currency: 'LNY',
          netDebitBalance: '-9007199254740993.000000000000000001',
        },
        {
          accountId: 'TEST_EXACT',
          accountClass: 'CASH',
          currency: 'GCU',
          netDebitBalance: '0.000000000000000001',
        },
      ];
      f.setCarrier(carrier);
      const client = f.client();
      const result = await client.readProjection(
        '11111111-1111-4111-8111-111111111111',
      );
      const model = consumeOfficeProjection(result, f.config, role);
      client.disconnect();
      if (model.kind !== 'CURRENT') throw Error(model.code);
      const doc = new HostDocument(role);
      const element = renderOfficeReadout(doc as unknown as Document, model);
      expect(element.textContent).toContain(
        '-9007199254740993.000000000000000001 LNY',
      );
      expect(element.textContent).toContain('0.000000000000000001 GCU');
      expect(element.textContent).not.toContain(
        '-9007199254740993.000000000000000001 GCU',
      );
      expect(element.textContent).not.toMatch(/NaN|Infinity|e-\d/u);
    },
  );

  it('does not infer zero or a balance when the position producer is absent', async () => {
    const f = currentFinancialPositionFixture('finance');
    f.setCarrier(undefined);
    f.payload.ledger.financialPositions = [];
    const client = f.client();
    const result = await client.readProjection(
      '11111111-1111-4111-8111-111111111111',
    );
    const model = consumeOfficeProjection(result, f.config, 'finance');
    client.disconnect();
    if (model.kind !== 'CURRENT') throw Error(model.code);
    const doc = new HostDocument('finance');
    const element = renderOfficeReadout(doc as unknown as Document, model);
    expect(element.textContent).toContain('FINANCIAL_POSITION_UNAVAILABLE');
    expect(element.textContent).toContain(
      'This is not a zero or spendable balance',
    );
    expect(element.textContent).not.toContain('0 GCU');
  });
});
