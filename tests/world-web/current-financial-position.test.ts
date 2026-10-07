import { describe, expect, it } from 'vitest';
import { consumeOfficeProjection } from '../../apps/world-web/src/office-projection/model.js';
import { currentFinancialPositionFixture } from './current-financial-position-fixture.js';
import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import type { OfficeRole } from '../../apps/world-web/src/office-projection/model.js';
import type { ProjectionResult } from '../../apps/world-web/src/production-read/client.js';

const requestId = '11111111-1111-4111-8111-111111111111';
describe('current ledger position consumer / OFFLINE TEST_ONLY', () => {
  it('Finance shows current 13 separately from net movement 3, without browser arithmetic', async () => {
    const f = currentFinancialPositionFixture('finance'),
      port = f.client();
    const model = consumeOfficeProjection(
      await port.readProjection(requestId),
      f.config,
      'finance',
    );
    if (model.kind !== 'CURRENT') throw new Error(model.code);
    expect(model).toMatchObject({
      currentFinancialPosition: {
        availability: 'AVAILABLE',
        fields: [
          {
            canonicalValue: '13',
            unit: 'GCU',
            nature: 'CURRENT_LEDGER_POSITION',
          },
        ],
      },
    });
    expect(model.readouts[1]?.canonicalValue).toBe('3');
    port.disconnect();
  });
  it('legacy missing position is unavailable, never a zero or net-movement fallback', async () => {
    const f = currentFinancialPositionFixture('finance');
    f.setCarrier(undefined);
    const port = f.client(),
      model = consumeOfficeProjection(
        await port.readProjection(requestId),
        f.config,
        'finance',
      );
    if (model.kind !== 'CURRENT') throw new Error(model.code);
    expect(model).toMatchObject({
      currentFinancialPosition: { availability: 'UNAVAILABLE', fields: [] },
    });
    expect(model.readouts[1]?.canonicalValue).toBe('3');
    port.disconnect();
  });
  it('Central Bank current 7 is separate from movement -3', async () => {
    const f = currentFinancialPositionFixture('central_bank'),
      port = f.client();
    const model = consumeOfficeProjection(
      await port.readProjection(requestId),
      f.config,
      'central_bank',
    );
    if (model.kind !== 'CURRENT') throw new Error(model.code);
    expect(model.currentFinancialPosition.fields[0]?.canonicalValue).toBe('7');
    expect(model.readouts[1]?.canonicalValue).toBe('-3');
    port.disconnect();
  });
  it.each([
    [
      'different seed at the same head',
      (p: Record<string, unknown>) => {
        (p.opening as Record<string, unknown>).seedId = 'OTHER_SEED';
      },
    ],
    [
      'different fingerprint at the same head',
      (p: Record<string, unknown>) => {
        (p.opening as Record<string, unknown>).seedFingerprint =
          `sha256:${'b'.repeat(64)}`;
      },
    ],
    [
      'wrong world head',
      (p: Record<string, unknown>) => {
        (p.sourceHead as Record<string, unknown>).worldVersion = '3';
      },
    ],
    [
      'wrong event head',
      (p: Record<string, unknown>) => {
        (p.sourceHead as Record<string, unknown>).eventSequence = '1';
      },
    ],
    [
      'future opening',
      (p: Record<string, unknown>) => {
        (p.opening as Record<string, unknown>).openingWorldVersion = '3';
      },
    ],
    [
      'noncanonical opening',
      (p: Record<string, unknown>) => {
        (p.opening as Record<string, unknown>).openingWorldVersion = '02';
      },
    ],
    [
      'unknown semantics',
      (p: Record<string, unknown>) => {
        p.semantics = 'SPENDABLE';
      },
    ],
    [
      'unknown coverage',
      (p: Record<string, unknown>) => {
        p.positionCoverage = 'ALL';
      },
    ],
    [
      'extra field',
      (p: Record<string, unknown>) => {
        p.cash = '999';
      },
    ],
    [
      'extra opening field',
      (p: Record<string, unknown>) => {
        (p.opening as Record<string, unknown>).amount = '10';
      },
    ],
    [
      'wrong source unit',
      (p: Record<string, unknown>) => {
        p.sourceUnits = ['CENTRAL_BANK-U0585'];
      },
    ],
    [
      'duplicate source unit',
      (p: Record<string, unknown>) => {
        p.sourceUnits = ['FINANCE-U0831', 'FINANCE-U0831'];
      },
    ],
    [
      'zero sparse entry',
      (p: Record<string, unknown>) => {
        (p.positions as Record<string, unknown>[])[0]!.netDebitBalance = '0';
      },
    ],
    [
      'noncanonical amount',
      (p: Record<string, unknown>) => {
        (p.positions as Record<string, unknown>[])[0]!.netDebitBalance = '13.0';
      },
    ],
    [
      'unknown class',
      (p: Record<string, unknown>) => {
        (p.positions as Record<string, unknown>[])[0]!.accountClass =
          'TREASURY';
      },
    ],
    [
      'unknown currency',
      (p: Record<string, unknown>) => {
        (p.positions as Record<string, unknown>[])[0]!.currency = 'GCU_EXTRA';
      },
    ],
    [
      'duplicate position',
      (p: Record<string, unknown>) => {
        (p.positions as unknown[]).push(
          structuredClone((p.positions as unknown[])[0]),
        );
      },
    ],
  ] as const)(
    '%s is unavailable without replacing valid movements',
    async (_label, mutate) => {
      const f = currentFinancialPositionFixture('finance'),
        p = f.getCarrier();
      mutate(p);
      f.setCarrier(p);
      const port = f.client(),
        model = consumeOfficeProjection(
          await port.readProjection(requestId),
          f.config,
          'finance',
        );
      if (model.kind !== 'CURRENT') throw new Error(model.code);
      expect(model.currentFinancialPosition).toEqual({
        availability: 'UNAVAILABLE',
        fields: [],
        provenance: [],
      });
      expect(model.readouts[1]?.canonicalValue).toBe('3');
      port.disconnect();
    },
  );
  it('signed exact equity positions are preserved and deeply frozen', async () => {
    const f = currentFinancialPositionFixture('finance'),
      p = f.getCarrier();
    Object.assign((p.positions as Record<string, unknown>[])[0]!, {
      accountClass: 'EQUITY',
      netDebitBalance: '-9007199254740993.25',
    });
    f.setCarrier(p);
    const port = f.client(),
      model = consumeOfficeProjection(
        await port.readProjection(requestId),
        f.config,
        'finance',
      );
    if (model.kind !== 'CURRENT') throw new Error(model.code);
    const position = model.currentFinancialPosition;
    expect(position.fields[0]?.canonicalValue).toBe('-9007199254740993.25');
    expect(Object.isFrozen(position)).toBe(true);
    expect(Object.isFrozen(position.fields[0])).toBe(true);
    expect(Object.isFrozen(position.provenance[0])).toBe(true);
    port.disconnect();
  });
  it('empty authorized sparse coverage does not create a zero account', async () => {
    const f = currentFinancialPositionFixture('finance'),
      p = f.getCarrier();
    p.positions = [];
    f.setCarrier(p);
    const port = f.client(),
      model = consumeOfficeProjection(
        await port.readProjection(requestId),
        f.config,
        'finance',
      );
    if (model.kind !== 'CURRENT') throw new Error(model.code);
    expect(model.currentFinancialPosition.availability).toBe('AVAILABLE');
    expect(model.currentFinancialPosition.fields).toEqual([]);
    port.disconnect();
  });
  it.each(['captain', 'industry', 'trade', 'social'] as OfficeRole[])(
    '%s cannot gain access from tainted Finance metadata',
    async (role) => {
      const f = currentFinancialPositionFixture(role);
      f.setCarrier(currentFinancialPositionFixture('finance').getCarrier());
      const port = f.client(),
        model = consumeOfficeProjection(
          await port.readProjection(requestId),
          f.config,
          role,
        );
      if (model.kind !== 'CURRENT') throw new Error(model.code);
      expect(model.currentFinancialPosition).toEqual({
        availability: 'NOT_AUTHORIZED',
        fields: [],
        provenance: [],
      });
      port.disconnect();
    },
  );
  it('COUNTRY scope cannot gain private current positions', async () => {
    const f = currentFinancialPositionFixture('finance');
    Object.assign(f.config.identity, { classification: 'COUNTRY' });
    const port = f.client(),
      model = consumeOfficeProjection(
        await port.readProjection(requestId),
        f.config,
        'finance',
      );
    if (model.kind !== 'CURRENT') throw new Error(model.code);
    expect(model.currentFinancialPosition.availability).toBe('NOT_AUTHORIZED');
    port.disconnect();
  });
  it('denial retires previous values; malformed denial never exposes provenance', async () => {
    const f = currentFinancialPositionFixture('finance'),
      c = createOfficeProjectionController(
        f.binding,
        () => f.binding.view,
        () => f.client(),
        () => requestId,
      );
    await c.refresh();
    expect(
      c.getState().model?.currentFinancialPosition.fields[0]?.canonicalValue,
    ).toBe('13');
    const denied = {
      schemaVersion: 'authoritative-financial-position-v1',
      status: 'NOT_AUTHORIZED',
      reason: 'SCOPE_NOT_AUTHORIZED',
    };
    f.setCarrier(denied);
    await c.refresh();
    // A different payload at an already accepted head is rejected by the
    // existing scoped cache. It must retire values, not replace that snapshot.
    expect(c.getState().model).toBeNull();
    c.disconnect();
    const port = f.client();
    const deniedModel = consumeOfficeProjection(
      await port.readProjection(requestId),
      f.config,
      'finance',
    );
    if (deniedModel.kind !== 'CURRENT') throw new Error(deniedModel.code);
    expect(deniedModel.currentFinancialPosition).toEqual({
      availability: 'NOT_AUTHORIZED',
      fields: [],
      provenance: [],
    });
    port.disconnect();
    f.setCarrier({ ...denied, positions: [{ netDebitBalance: '13' }] });
    const otherPort = f.client();
    const malformedModel = consumeOfficeProjection(
      await otherPort.readProjection(requestId),
      f.config,
      'finance',
    );
    if (malformedModel.kind !== 'CURRENT') throw new Error(malformedModel.code);
    expect(malformedModel.currentFinancialPosition).toEqual({
      availability: 'UNAVAILABLE',
      fields: [],
      provenance: [],
    });
    otherPort.disconnect();
  });
  it('original FINAL refresh pins current position to v3; revocation clears it', async () => {
    const f = currentFinancialPositionFixture('finance'),
      c = createOfficeProjectionController(
        f.binding,
        () => f.binding.view,
        () => f.client(),
        () => requestId,
      );
    await c.refresh();
    await c.lookupAndRefresh();
    expect(c.getState()).toMatchObject({
      model: {
        head: { worldVersion: '3' },
        currentFinancialPosition: {
          availability: 'AVAILABLE',
          provenance: expect.arrayContaining([
            { label: 'Source head', value: 'World v3 / event 3' },
          ]),
        },
      },
      receipt: { outcome: 'COMMITTED' },
    });
    f.invalidate();
    expect(c.getState().model).toBeNull();
    expect(c.getState().receipt).toBeNull();
    c.disconnect();
  });
  it.each(['role', 'country'] as const)(
    'late current position is retired on %s navigation',
    async (mode) => {
      const f = currentFinancialPositionFixture('finance'),
        port = f.client();
      let view = f.binding.view;
      let release!: (result: ProjectionResult) => void;
      const c = createOfficeProjectionController(
        f.binding,
        () => view,
        () => ({
          ...port,
          readProjection: () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        }),
        () => requestId,
      );
      const pending = c.refresh();
      const result = await port.readProjection(requestId);
      view =
        mode === 'role'
          ? { ...view, role: 'central_bank' }
          : { ...view, countryDisplayId: '02' };
      release(result);
      await pending;
      expect(c.getState().model).toBeNull();
      expect(c.getState().canRead).toBe(false);
      c.disconnect();
    },
  );
});
