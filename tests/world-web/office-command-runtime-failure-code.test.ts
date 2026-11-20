/** TEST_ONLY negative transport protocol. No positive backend response,
 * signature validation, real browser or economic command is supplied. */
import { describe, expect, it } from 'vitest';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { officeCommandFixture } from './office-command-fixture.js';
function fixture(status: number, code: string) {
  const f = officeCommandFixture('captain');
  const read = {
    ...f.binding.read,
    identity: {
      ...f.binding.read.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    endpoints: {
      ...f.binding.read.endpoints,
      projectionPath: POSTWAR_RUNTIME_PATH,
    },
  };
  read.currentIdentity = () => read.identity;
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push(new URL(String(url)).pathname);
    const body = JSON.parse(String(init?.body));
    return Response.json(
      {
        schemaVersion: POSTWAR_RUNTIME_SCHEMA,
        requestId: body.requestId,
        ok: false,
        error: { code },
      },
      { status },
    );
  };
  const c = createOfficeCommandController(
    { ...f.binding, read },
    () => f.binding.view,
    { fetcher, requestId: () => f.request.requestId },
  );
  return { c, f, calls };
}
describe('runtime current-page failure retains public code', () => {
  it('preserves the actual public read error code rather than replacing it with UNAVAILABLE', async () => {
    const { c, calls } = fixture(503, 'CURRENT_PUBLICATION_UNAVAILABLE');
    await c.refresh();
    expect(c.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      code: 'CURRENT_PUBLICATION_UNAVAILABLE',
      runtimePage: null,
      canStage: false,
    });
    expect(calls).toEqual([POSTWAR_RUNTIME_PATH]);
    c.disconnect();
  });
  it('403 still irreversibly retires the binding and clears a restored private original', async () => {
    const { c, f, calls } = fixture(403, 'DO_NOT_RETAIN_REVOKED_BINDING');
    expect(c.restoreOriginalForRecovery(f.request)).toBe(true);
    expect(c.getState().intent).not.toBeNull();
    await c.refresh();
    expect(c.getState()).toMatchObject({
      status: 'DENIED',
      code: 'DENIED',
      intent: null,
      runtimePage: null,
      receipt: null,
      acknowledgement: null,
      canRead: false,
      canStage: false,
      canRecover: false,
    });
    await c.refresh();
    expect(calls).toEqual([POSTWAR_RUNTIME_PATH]);
  });
});
