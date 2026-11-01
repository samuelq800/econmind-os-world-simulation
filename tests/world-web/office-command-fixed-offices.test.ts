/** Shipped clients/controllers, TEST_ONLY intercepted HTTP. This is not an
 * admitted database/authority/native/browser or formal economic acceptance. */
import { describe, it, expect } from 'vitest';
import { fixedOfficeCommandFixture } from './office-command-fixed-offices-fixture.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { createOfficeCommandClient } from '../../apps/world-web/src/office-command/client.js';
import { createOfficeRecoveryClient } from '../../apps/world-web/src/office-command/recovery-client.js';
import {
  MAX_OFFICE_TRANSPORT_REQUEST_BYTES,
  parseOfficeIntent,
  officeRecoveryRequest,
  officeFamilies,
} from '../../apps/world-web/src/office-command/contract.js';
function setup(role: 'trade' | 'central_bank') {
  const f = fixedOfficeCommandFixture(role),
    controller = createOfficeCommandController(
      f.binding,
      () => f.binding.view,
      { fetcher: f.fetcher, requestId: () => f.request.requestId },
    );
  return { ...f, controller };
}
describe('fixed Trade/CB submit and original-request recovery, bounded real wire contract', () => {
  it.each(['trade', 'central_bank'] as const)(
    '%s uses the actual bounded read path and recovers UNKNOWN→pending→FINAL without a supplied fingerprint or command retry',
    async (role) => {
      const f = setup(role);
      await f.controller.refresh();
      expect(f.controller.getState()).toMatchObject({
        status: 'CURRENT_AUTHORIZED_HEAD',
        model: null,
        currentHead: { worldVersion: '2' },
      });
      expect(
        f.controller.getState().runtimePage?.source.originWorldVersion,
      ).toBe('0');
      expect(f.controller.stage(f.request)).toBe(true);
      expect(f.controller.review()).toBe(true);
      await Promise.all([f.controller.confirm(), f.controller.confirm()]);
      expect(f.controller.getState()).toMatchObject({
        status: 'UNKNOWN',
        canRecover: true,
        canConfirm: false,
      });
      await f.controller.recoverOriginal();
      expect(f.controller.getState()).toMatchObject({
        status: 'QUEUE_ACK',
        code: 'RECOVERY_PENDING',
        receipt: null,
        completion: false,
      });
      const recovery = f.calls.find((c) => c.path === '/v1/command-recovery')!;
      expect(recovery.body.request).toEqual({
        worldId: f.request.request.worldId,
        commandId: f.request.request.commandId,
        idempotencyKey: f.request.request.idempotencyKey,
        originalRequest: f.request,
      });
      expect(recovery.init).toMatchObject({
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      });
      f.recover('final');
      await f.controller.lookupAndRefresh();
      expect(f.controller.getState()).toMatchObject({
        status: 'FINAL_VERIFIED',
        receipt: { outcome: 'COMMITTED' },
        currentHead: { worldVersion: '3' },
        completion: false,
        canStage: false,
      });
      expect(
        f.calls.filter((c) => c.path === '/v1/office-command'),
      ).toHaveLength(1);
      expect(
        f.calls.filter((c) => c.path === f.config.endpoints.finalLookupPath),
      ).toHaveLength(0);
      expect(
        f.calls
          .filter((c) => c.path === '/v1/postwar-office-runtime')
          .every((c) => c.body.operation === 'READ_CURRENT_OFFICE_OPENING'),
      ).toBe(true);
      expect(
        f.calls.every(
          (c) =>
            new TextEncoder().encode(JSON.stringify(c.body)).byteLength <=
            MAX_OFFICE_TRANSPORT_REQUEST_BYTES,
        ),
      ).toBe(true);
      f.controller.disconnect();
    },
  );
  it('distinguishes a valid EMPTY page from fetch failure and never treats an opening inventory origin as current stock', async () => {
    const f = setup('trade');
    f.read('empty');
    await f.controller.refresh();
    expect(f.controller.getState()).toMatchObject({
      status: 'CURRENT_AUTHORIZED_HEAD',
      runtimePage: {
        status: 'EMPTY',
        rows: [],
        source: { worldVersion: '0', originWorldVersion: '0' },
      },
      currentHead: { worldVersion: '2' },
    });
    f.read('unavailable');
    await f.controller.refresh();
    expect(f.controller.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      runtimePage: null,
      currentHead: null,
      canStage: false,
    });
    f.controller.disconnect();
  });
  it('keeps FINAL separate when its current publication is unavailable and never resubmits', async () => {
    const f = setup('central_bank');
    await f.controller.refresh();
    f.controller.stage(f.request);
    f.controller.review();
    await f.controller.confirm();
    f.recover('final');
    f.read('unavailable');
    await f.controller.recoverOriginal();
    expect(f.controller.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      receipt: { outcome: 'COMMITTED' },
      runtimePage: null,
      currentHead: null,
      completion: false,
      canConfirm: false,
      canStage: false,
    });
    await f.controller.confirm();
    expect(f.calls.filter((c) => c.path === '/v1/office-command')).toHaveLength(
      1,
    );
    f.read('page');
    await f.controller.refresh();
    expect(f.controller.getState()).toMatchObject({
      status: 'FINAL_VERIFIED',
      currentHead: { worldVersion: '3' },
      completion: false,
    });
    f.controller.disconnect();
  });
  it('does not turn recovery NOT_FOUND or a definite source rejection into permission to retry', async () => {
    const f = setup('trade');
    await f.controller.refresh();
    f.controller.stage(f.request);
    f.controller.review();
    await f.controller.confirm();
    f.recover('unavailable');
    await f.controller.recoverOriginal();
    expect(f.controller.getState()).toMatchObject({
      status: 'UNKNOWN',
      code: 'NOT_FOUND',
      canRecover: true,
      canConfirm: false,
    });
    await f.controller.confirm();
    expect(f.calls.filter((c) => c.path === '/v1/office-command')).toHaveLength(
      1,
    );
    f.controller.disconnect();
    const rejected = setup('trade');
    rejected.submit('source-rejected');
    await rejected.controller.refresh();
    rejected.controller.stage(rejected.request);
    rejected.controller.review();
    await rejected.controller.confirm();
    expect(rejected.controller.getState()).toMatchObject({
      status: 'REJECTED',
      canRecover: false,
    });
    await rejected.controller.recoverOriginal();
    expect(
      rejected.calls.filter((c) => c.path === '/v1/command-recovery'),
    ).toHaveLength(0);
    rejected.controller.disconnect();
  });
  it('reserves the real 16KiB HTTP budget for both submit and the larger recovery wrapper before dispatch', async () => {
    const f = setup('trade'),
      original = JSON.parse(JSON.stringify(f.request));
    original.request.payload.padding = '';
    const base = new TextEncoder().encode(JSON.stringify(original)).byteLength;
    original.request.payload.padding = 'x'.repeat(16300 - base);
    expect(
      new TextEncoder().encode(JSON.stringify(original)).byteLength,
    ).toBeLessThanOrEqual(16384);
    expect(
      new TextEncoder().encode(
        JSON.stringify(officeRecoveryRequest(original, original.requestId)),
      ).byteLength,
    ).toBeGreaterThan(16384);
    expect(parseOfficeIntent(original, f.config)).toBeNull();
    const client = createOfficeCommandClient(f.endpoint, f.config, {
        fetcher: f.fetcher,
      }),
      recovery = createOfficeRecoveryClient(f.endpoint, f.config, {
        fetcher: f.fetcher,
      });
    expect((await client.submit(original)).status).toBe('INVALID_REQUEST');
    expect((await recovery.recover(original, original.requestId)).status).toBe(
      'INVALID_REQUEST',
    );
    expect(f.calls).toEqual([]);
    client.disconnect();
    recovery.disconnect();
    f.controller.disconnect();
  });
  it('registers only manual reserve for Trade and rejects automatic or wrong-office families', () => {
    const f = setup('trade');
    expect(officeFamilies.TRADE).toEqual(['CORE_GOODS_TRANSFER_V1']);
    for (const commandType of [
      'CORE_GOODS_SHIPMENT_V1',
      'CORE_GOODS_DELIVERY_V1',
      'CORE_CENTRAL_BANK_OMO_V1',
      'POSTWAR_DAY_ONE_PRIVATE_FX_SPOT_V1',
    ])
      expect(
        parseOfficeIntent(
          { ...f.request, request: { ...f.request.request, commandType } },
          f.config,
        ),
      ).toBeNull();
    f.controller.disconnect();
  });
  it('discards recovery after role/session invalidation and never accepts a mismatched original fingerprint', async () => {
    const f = setup('trade');
    let reply!: (r: Response) => void,
      started!: () => void,
      signal: AbortSignal | undefined;
    const began = new Promise<void>((r) => {
        started = r;
      }),
      client = createOfficeRecoveryClient(f.endpoint, f.config, {
        fetcher: async (_input, init) => {
          signal = init?.signal ?? undefined;
          started();
          return new Promise<Response>((r) => {
            reply = r;
          });
        },
      });
    const pending = client.recover(f.request, f.request.requestId);
    await began;
    f.invalidate();
    client.disconnect();
    expect(signal?.aborted).toBe(true);
    reply(Response.json({}));
    expect((await pending).status).not.toBe('FINAL');
    const g = setup('central_bank'),
      wrong = createOfficeRecoveryClient(g.endpoint, g.config, {
        fetcher: g.fetcher,
      });
    const result = await wrong.recover(
      g.request,
      g.request.requestId,
      'sha256:' + 'f'.repeat(64),
    );
    expect(result.status).toBe('UNAVAILABLE');
    wrong.disconnect();
    f.controller.disconnect();
    g.controller.disconnect();
  });
});
