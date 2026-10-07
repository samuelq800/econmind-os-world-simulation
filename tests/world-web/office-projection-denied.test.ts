import { describe, expect, it } from 'vitest';
import { createOfficeProjectionController } from '../../apps/world-web/src/office-projection/controller.js';
import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';
import { officeProjectionFixture } from './office-projection-fixture.js';

const requestId = () => '11111111-1111-4111-8111-111111111111';
const revokedState = {
  status: 'DENIED',
  code: 'DENIED',
  connection: 'NOT_CONNECTED',
  receipt: null,
  model: null,
  canRead: false,
  canLookupFinal: false,
  command: { kind: 'DISABLED', code: 'PRODUCTION_COMMAND_PORT_MISSING' },
};

describe('D-READ-01 / real client with OFFLINE TEST_ONLY transport', () => {
  it.each([401, 403])(
    'HTTP %i after FINAL retires binding, clears all and disables further reads',
    async (status) => {
      const f = officeProjectionFixture('finance');
      let denied = false,
        calls = 0;
      const port = createProductionReadClient(f.config, {
        fetcher: async (input, init) => {
          calls++;
          return denied
            ? new Response(null, { status })
            : f.fetcher(input, init);
        },
      });
      const c = createOfficeProjectionController(
        f.binding,
        () => f.binding.view,
        () => port,
        requestId,
      );
      await c.lookupAndRefresh();
      expect(c.getState().receipt?.outcome).toBe('COMMITTED');
      expect(c.getState().model?.head.worldVersion).toBe('3');
      denied = true;
      await c.refresh();
      expect(port.state()).toBe('NOT_CONNECTED');
      expect(c.getState()).toMatchObject(revokedState);
      const count = calls;
      await c.refresh();
      await c.lookupAndRefresh();
      expect(calls).toBe(count);
      expect(c.getState()).toMatchObject(revokedState);
    },
  );

  it.each([401, 403])(
    'late FINAL cannot restore the controller after real-client HTTP %i retirement',
    async (status) => {
      const f = officeProjectionFixture('trade');
      let hold = false,
        denyProjection = false;
      let release!: (response: Response) => void, started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      let lateResponse: Promise<Response> | null = null;
      const port = createProductionReadClient(f.config, {
        fetcher: (input, init) => {
          const path = new URL(String(input)).pathname;
          if (hold && path === f.config.endpoints.finalLookupPath) {
            lateResponse = f.fetcher(input, init);
            started();
            return new Promise<Response>((resolve) => {
              release = resolve;
            });
          }
          return denyProjection && path === f.config.endpoints.projectionPath
            ? Promise.resolve(new Response(null, { status }))
            : f.fetcher(input, init);
        },
      });
      const c = createOfficeProjectionController(
        f.binding,
        () => f.binding.view,
        () => port,
        requestId,
      );
      await c.lookupAndRefresh();
      hold = true;
      const pending = c.lookupAndRefresh();
      await entered;
      denyProjection = true;
      expect(await port.readProjection(requestId())).toEqual({
        status: 'DENIED',
      });
      await pending;
      release(await lateResponse!);
      await Promise.resolve();
      await Promise.resolve();
      expect(c.getState()).toMatchObject(revokedState);
      expect(port.state()).toBe('NOT_CONNECTED');
    },
  );

  it.each([401, 403])(
    'late projection cannot restore old FINAL after real-client HTTP %i retirement',
    async (status) => {
      const f = officeProjectionFixture('finance');
      let hold = false,
        denyFinal = false;
      let release!: (response: Response) => void, started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      let lateResponse: Promise<Response> | null = null;
      const port = createProductionReadClient(f.config, {
        fetcher: (input, init) => {
          const path = new URL(String(input)).pathname;
          if (hold && path === f.config.endpoints.projectionPath) {
            lateResponse = f.fetcher(input, init);
            started();
            return new Promise<Response>((resolve) => {
              release = resolve;
            });
          }
          return denyFinal && path === f.config.endpoints.finalLookupPath
            ? Promise.resolve(new Response(null, { status }))
            : f.fetcher(input, init);
        },
      });
      const c = createOfficeProjectionController(
        f.binding,
        () => f.binding.view,
        () => port,
        requestId,
      );
      await c.lookupAndRefresh();
      hold = true;
      const pending = c.refresh();
      await entered;
      denyFinal = true;
      expect(await port.lookupFinal(requestId(), f.lookup)).toEqual({
        status: 'DENIED',
      });
      await pending;
      release(await lateResponse!);
      await Promise.resolve();
      await Promise.resolve();
      expect(c.getState()).toMatchObject(revokedState);
    },
  );

  it('ordinary HTTP 500 refresh keeps verified FINAL and remains retryable, without current fields', async () => {
    const f = officeProjectionFixture('trade');
    let unavailable = false;
    const port = createProductionReadClient(f.config, {
      fetcher: (input, init) =>
        unavailable
          ? Promise.resolve(new Response(null, { status: 500 }))
          : f.fetcher(input, init),
    });
    const c = createOfficeProjectionController(
      f.binding,
      () => f.binding.view,
      () => port,
      requestId,
    );
    await c.lookupAndRefresh();
    unavailable = true;
    await c.refresh();
    expect(c.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      model: null,
      receipt: { outcome: 'COMMITTED' },
      canRead: true,
      canLookupFinal: true,
    });
    c.disconnect();
  });
});
