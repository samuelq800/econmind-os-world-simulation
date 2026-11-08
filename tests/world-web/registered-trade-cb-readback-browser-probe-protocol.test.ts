/** Preflight rejection only. No browser/backend response is supplied or faked;
 * these cases are not actual Chromium/registered backend acceptance. */
import { describe, expect, it } from 'vitest';
import { runRegisteredTradeCbReadbackBrowserProbe } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
import type { RegisteredTradeCbReadbackBrowserInput } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
function preflight(expectedHead: unknown) {
  return {
    browser: {},
    application: {},
    expectedHead,
  } as RegisteredTradeCbReadbackBrowserInput;
}
describe('Trade/CB read-only browser probe preflight (NOT browser acceptance)', () => {
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
