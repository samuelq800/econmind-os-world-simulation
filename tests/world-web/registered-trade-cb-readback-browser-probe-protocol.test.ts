/** Preflight rejection only. No browser/backend response is supplied or faked;
 * these cases are not actual Chromium/registered backend acceptance. */
import { describe, expect, it } from 'vitest';
import {
  runRegisteredTradeCbReadbackBrowserProbe,
  registeredReadbackFailureState,
  registeredReadbackPublicErrorCode,
} from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
import type { RegisteredTradeCbReadbackBrowserInput } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
function preflight(expectedHead: unknown) {
  return {
    browser: {},
    application: {},
    expectedHead,
  } as RegisteredTradeCbReadbackBrowserInput;
}
describe('Trade/CB read-only browser probe preflight (NOT browser acceptance)', () => {
  it('retains only bounded failure status/code/page identity, never full intent, JWT or headers', () => {
    const value = {
      status: 'UNAVAILABLE',
      code: 'FETCH_FAILED',
      runtimePage: null,
      intent: { accessToken: 'SECRET_TEST_ONLY' },
      headers: { authorization: 'Bearer SECRET_TEST_ONLY' },
    };
    expect(registeredReadbackFailureState(value)).toEqual({
      status: 'UNAVAILABLE',
      code: 'FETCH_FAILED',
      dataset: null,
      hasRuntimePage: false,
    });
    expect(JSON.stringify(registeredReadbackFailureState(value))).not.toContain(
      'SECRET_TEST_ONLY',
    );
  });
  it('takes only a public typed HTTP error code, not message/headers/raw response', () => {
    expect(
      registeredReadbackPublicErrorCode({
        error: {
          code: 'CURRENT_SOURCE_UNAVAILABLE',
          message: 'SECRET_TEST_ONLY',
        },
        headers: { authorization: 'SECRET_TEST_ONLY' },
      }),
    ).toBe('CURRENT_SOURCE_UNAVAILABLE');
    expect(
      registeredReadbackPublicErrorCode({
        error: { code: 'Bearer SECRET_TEST_ONLY' },
      }),
    ).toBeNull();
    expect(registeredReadbackPublicErrorCode({ ok: true })).toBeNull();
  });
  it('requires an already-owned browser and application', async () => {
    await expect(
      runRegisteredTradeCbReadbackBrowserProbe(
        {} as RegisteredTradeCbReadbackBrowserInput,
      ),
    ).rejects.toThrow('EXISTING_BROWSER_AND_APPLICATION_REQUIRED');
  });
  it.each([
    undefined,
    {},
    { worldVersion: '3' },
    { worldVersion: '3', eventSequence: '03' },
    { worldVersion: '-1', eventSequence: '3' },
    { worldVersion: '0', eventSequence: '0' },
    { worldVersion: '3', eventSequence: '3', authority: true },
  ])(
    'refuses an absent, malformed or opening-only expected head before any fixture access: %j',
    async (expectedHead) => {
      await expect(
        runRegisteredTradeCbReadbackBrowserProbe(preflight(expectedHead)),
      ).rejects.toThrow();
    },
  );
});
