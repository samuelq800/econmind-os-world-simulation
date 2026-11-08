/** TEST_ONLY negative browser-adapter protocol. No positive backend response,
 * Chromium, JWT, Node host, database or actual Native acceptance is simulated. */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const adapter = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock(
  '../../tools/office-connection/registered-office-browser-acceptance.mjs',
  () => ({ createRegisteredOfficeBrowserAcceptance: adapter.create }),
);
import { runRegisteredTradeCbReadbackBrowserProbe } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
import type { RegisteredTradeCbReadbackBrowserInput } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
afterEach(() => vi.clearAllMocks());
it('saves a real file for a negative adapter observation and still throws the exact original failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'readback-failure-protocol-'));
  try {
    const sentinel = Error('TEST_ONLY_BROWSER_READ_FAILED');
    const closed = vi.fn(async () => undefined);
    let response: ((value: unknown) => void) | undefined;
    adapter.create.mockResolvedValue({
      evidence: { metadata: [] },
      close: closed,
      openOffice: async () => ({
        page: {
          route: async () => undefined,
          on: (_event: string, fn: (value: unknown) => void) => {
            response = fn;
          },
        },
        state: async () => ({
          status: 'UNAVAILABLE',
          code: 'CURRENT_SOURCE_UNAVAILABLE',
          runtimePage: null,
          intent: { jwt: 'TEST_ONLY_SECRET' },
          headers: { authorization: 'TEST_ONLY_SECRET' },
        }),
        read: async () => {
          response!({
            request: () => ({ method: () => 'POST' }),
            url: () => 'https://api.example/v1/postwar-office-runtime',
            status: () => 503,
            body: async () =>
              Buffer.from(
                JSON.stringify({
                  ok: false,
                  error: {
                    code: 'CURRENT_SOURCE_UNAVAILABLE',
                    message: 'TEST_ONLY_SECRET',
                  },
                  headers: { authorization: 'TEST_ONLY_SECRET' },
                }),
              ),
          });
          throw sentinel;
        },
      }),
    });
    const file = path.join(dir, 'failure.json');
    await expect(
      runRegisteredTradeCbReadbackBrowserProbe({
        browser: {},
        application: {},
        expectedHead: { worldVersion: '3', eventSequence: '3' },
        failureEvidencePath: file,
        readConfiguration: {
          admittedWorldPins: {},
          endpointPins: { projectionPath: '/v1/postwar-office-runtime' },
        },
      } as unknown as RegisteredTradeCbReadbackBrowserInput),
    ).rejects.toBe(sentinel);
    const bytes = await readFile(file, 'utf8'),
      result = JSON.parse(bytes);
    expect(result.classification).toBe(
      'ACTUAL_READBACK_FAILURE_DIAGNOSTICS_NOT_SUCCESS',
    );
    expect(result.states.trade).toEqual({
      status: 'UNAVAILABLE',
      code: 'CURRENT_SOURCE_UNAVAILABLE',
      dataset: null,
      hasRuntimePage: false,
    });
    expect(result.network[0]).toMatchObject({
      status: 503,
      publicErrorCode: 'CURRENT_SOURCE_UNAVAILABLE',
    });
    expect(result.completedRecords).toEqual([]);
    expect(bytes).not.toContain('TEST_ONLY_SECRET');
    expect(closed).toHaveBeenCalledOnce();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
