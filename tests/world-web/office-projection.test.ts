import { describe, expect, it } from 'vitest';
import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import {
  consumeOfficeProjection,
  officeProjectionRoles,
  type OfficeProjectionView,
  type OfficeRole,
} from '../../apps/world-web/src/office-projection/model.js';
import type { ProjectionResult } from '../../apps/world-web/src/production-read/client.js';
import { officeProjectionFixture } from './office-projection-fixture.js';

const roles = Object.keys(officeProjectionRoles) as OfficeRole[];
const uuid = () => '11111111-1111-4111-8111-111111111111';
describe('six-office real DTO wiring / OFFLINE TEST_ONLY', () => {
  it.each(roles)(
    '%s consumes exact activity/Posting units and source pins, not role balances',
    async (role) => {
      const f = officeProjectionFixture(role),
        port = f.client();
      const result = await port.readProjection(uuid());
      const model = consumeOfficeProjection(result, f.config, role);
      expect(model.kind).toBe('CURRENT');
      if (model.kind !== 'CURRENT') throw Error(model.code);
      expect(model.head).toMatchObject({
        worldVersion: '2',
        eventSequence: '2',
        seatRef: 'TEST_SEAT',
        readbackRef: 'TEST_READBACK',
        officeId: officeProjectionRoles[role],
        admissionRef: 'TEST_ADMISSION',
      });
      expect(model.readouts[1]).toMatchObject({
        canonicalValue: '9007199254740993.25',
        unit: 'GCU',
        nature: 'NET_POSTING_MOVEMENT',
      });
      expect(model.readouts[2]).toMatchObject({
        canonicalValue: '-0.125',
        unit: 'tonne',
      });
      expect(model.missing).toHaveLength(3);
      expect(
        model.missing.every((x) => x.code === 'ROLE_FIELD_NOT_PROJECTED'),
      ).toBe(true);
      port.disconnect();
    },
  );
  it.each(roles)(
    '%s FINAL lookup automatically refreshes at final readback head; submit remains unavailable',
    async (role) => {
      const f = officeProjectionFixture(role);
      const c = createOfficeProjectionController(
        f.binding,
        () => f.binding.view,
        () => f.client(),
        uuid,
      );
      await c.refresh();
      expect(c.getState().model?.head.worldVersion).toBe('2');
      await c.lookupAndRefresh();
      expect(f.calls.map((x) => x.path)).toEqual([
        '/v1/test-only-read',
        '/v1/test-only-final',
        '/v1/test-only-read',
      ]);
      expect(f.calls.map((x) => x.body.operation)).toEqual([
        'READ_WORLD_PROJECTION',
        'READ_FINAL_NARROW_TRANSFER_RECEIPT',
        'READ_WORLD_PROJECTION',
      ]);
      expect(c.getState()).toMatchObject({
        status: 'CURRENT',
        model: { head: { worldVersion: '3' } },
        receipt: { outcome: 'COMMITTED', worldVersionAfter: '3' },
        command: { kind: 'DISABLED', code: 'PRODUCTION_COMMAND_PORT_MISSING' },
      });
      c.disconnect();
    },
  );
  it.each(roles)(
    '%s has no implicit config, fallback or generated seat',
    async (role) => {
      const c = createOfficeProjectionController(
        null,
        () => ({ countryDisplayId: '01', role }),
        () => {
          throw Error('No factory call permitted');
        },
      );
      await c.refresh();
      await c.lookupAndRefresh();
      expect(c.getState()).toMatchObject({
        status: 'MISSING',
        connection: 'NOT_CONNECTED',
        model: null,
        receipt: null,
        canRead: false,
        canLookupFinal: false,
      });
    },
  );
  it.each(['session', 'country', 'role'] as const)(
    'retires and clears visible values on %s loss',
    async (loss) => {
      const f = officeProjectionFixture('finance');
      let view: OfficeProjectionView = f.binding.view;
      const c = createOfficeProjectionController(
        f.binding,
        () => view,
        () => f.client(),
        uuid,
      );
      await c.refresh();
      if (loss === 'session') f.invalidate();
      else
        view =
          loss === 'country'
            ? { ...view, countryDisplayId: '70' }
            : { ...view, role: 'social' };
      expect(c.getState()).toMatchObject({
        status: 'MISSING',
        model: null,
        receipt: null,
        canRead: false,
      });
      view = f.binding.view;
      await c.refresh();
      expect(f.calls).toHaveLength(1);
    },
  );
  it('drops late read on view change, with no automatic reconnect', async () => {
    const f = officeProjectionFixture('trade');
    let view: OfficeProjectionView = f.binding.view;
    const port = f.client();
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
      uuid,
    );
    const pending = c.refresh();
    const result = await port.readProjection(uuid());
    view = { ...view, countryDisplayId: '02' };
    release(result);
    await pending;
    expect(c.getState()).toMatchObject({ status: 'MISSING', model: null });
  });
  it.each([
    'country',
    'office',
    'decimal',
    'unit',
    'duplicate',
    'schema',
    'activity-head',
  ])('fails closed for malformed/mismatched %s DTO', async (mode) => {
    const f = officeProjectionFixture('captain'),
      p = f.payload;
    if (mode === 'country') p.countryId = 'TEST_OTHER';
    if (mode === 'office') p.officeId = 'SOCIAL';
    if (mode === 'decimal')
      p.ledger.financialPositions[0]!.netDebitBalance = '1.00';
    if (mode === 'unit') p.ledger.inventoryPositions[0]!.unit = '';
    if (mode === 'duplicate')
      p.ledger.inventoryPositions.push({ ...p.ledger.inventoryPositions[0]! });
    if (mode === 'schema') p.schemaVersion = 'TEST_UNSUPPORTED';
    if (mode === 'activity-head')
      p.activity.lastAuthoritativeEventSequence = '999';
    const port = f.client(),
      result = await port.readProjection(uuid());
    expect(consumeOfficeProjection(result, f.config, 'captain').kind).toBe(
      'MISSING',
    );
    port.disconnect();
  });
  it('keeps FINAL distinct from failed refresh; no old/current field reuse', async () => {
    const f = officeProjectionFixture('finance'),
      port = f.client();
    let reads = 0;
    const c = createOfficeProjectionController(
      f.binding,
      () => f.binding.view,
      () => ({
        ...port,
        readProjection: (id) =>
          ++reads === 1
            ? port.readProjection(id)
            : Promise.resolve({ status: 'UNAVAILABLE' }),
      }),
      uuid,
    );
    await c.refresh();
    await c.lookupAndRefresh();
    expect(c.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      model: null,
      receipt: { outcome: 'COMMITTED' },
    });
    c.disconnect();
  });
  it('busy repeated read/lookup clicks do not duplicate requests', async () => {
    const f = officeProjectionFixture('social'),
      port = f.client();
    let release!: (result: ProjectionResult) => void;
    const c = createOfficeProjectionController(
      f.binding,
      () => f.binding.view,
      () => ({
        ...port,
        readProjection: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      }),
      uuid,
    );
    const pending = c.refresh();
    await c.refresh();
    await c.lookupAndRefresh();
    expect(c.getState()).toMatchObject({
      canRead: false,
      canLookupFinal: false,
    });
    release(await port.readProjection(uuid()));
    await pending;
    expect(f.calls).toHaveLength(1);
    c.disconnect();
  });
  it('rejects a stale refresh below the FINAL readback without hiding the receipt', async () => {
    const f = officeProjectionFixture('trade'),
      port = f.client();
    const old = await port.readProjection(uuid());
    const c = createOfficeProjectionController(
      f.binding,
      () => f.binding.view,
      () => ({ ...port, readProjection: async () => old }),
      uuid,
    );
    await c.lookupAndRefresh();
    expect(c.getState()).toMatchObject({
      status: 'STALE',
      model: null,
      receipt: { worldVersionAfter: '3' },
    });
    c.disconnect();
  });
  it('does not enable original FINAL lookup without a supplied original reference', async () => {
    const f = officeProjectionFixture('captain');
    const c = createOfficeProjectionController(
      { read: f.config, view: f.binding.view },
      () => f.binding.view,
      () => f.client(),
      uuid,
    );
    await c.lookupAndRefresh();
    expect(f.calls).toHaveLength(0);
    expect(c.getState().canLookupFinal).toBe(false);
    c.disconnect();
  });
  it('snapshots host config and freezes consumed display values', async () => {
    const f = officeProjectionFixture('finance');
    const c = createOfficeProjectionController(
      f.binding,
      () => f.binding.view,
      () => f.client(),
      uuid,
    );
    await c.refresh();
    const model = c.getState().model;
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model?.head)).toBe(true);
    expect(Object.isFrozen(model?.readouts[1])).toBe(true);
    c.disconnect();
  });
});
