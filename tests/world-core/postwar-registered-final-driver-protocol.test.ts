/** Protocol-only simulated IPC/SQL/HTTP. No source proof, runtime authority,
 * database connection or native economic execution is issued by this test. */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('../support/postwar-registered-final-child.js', () => ({
  startPostwarRegisteredFinalNodeChild: host.launch,
}));
import { createRegisteredFinalDriver } from '../support/postwar-registered-final-driver.js';

const denied = {
  ok: false,
  error: {
    kind: 'ERROR',
    name: 'DomainError',
    code: 'TRANSITION_EVIDENCE_INVALID',
    message:
      'Production finite consumer cannot be activated through preparation',
  },
};
const fingerprint = 'sha256:' + '1'.repeat(64);
const eventRaw = '{}';
const eventHash =
  'sha256:' +
  createHash('sha256')
    .update('SHA-256\n' + eventRaw)
    .digest('hex');
const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true })));
});

async function protocol(
  startReply: unknown = denied,
  options: { stateAfterStart?: string; mutateCounts?: boolean } = {},
) {
  const evidenceDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'finite-protocol-'),
  );
  dirs.push(evidenceDirectory);
  const calls: string[] = [];
  let committed = false;
  let startAttempted = false;
  let generation = 0;
  host.launch.mockImplementation(async () => {
    const pid = ++generation;
    calls.push('INIT:' + pid);
    return {
      pid,
      ready: {
        pid,
        formalBinding: true,
        consumerState: 'PREPARED',
        origin: 'http://127.0.0.1:54321',
      },
      rpc: async (type: string) => {
        calls.push(type + ':' + pid);
        if (type === 'STATE')
          return {
            ok: true,
            value: {
              pid,
              ready: true,
              formalBinding: true,
              consumerState: startAttempted
                ? (options.stateAfterStart ?? 'PREPARED')
                : 'PREPARED',
            },
          };
        if (type === 'START') {
          startAttempted = true;
          return startReply;
        }
        if (type !== 'CONSUME' || committed) throw Error('UNEXPECTED_CONSUME');
        committed = true;
        return {
          ok: true,
          value: {
            status: 'PROCESSED',
            source: 'NEW_FINAL',
            commandId: 'RUN_ONE',
          },
        };
      },
      stop: async () => {
        calls.push('CLOSE:' + pid);
        return {
          pid,
          exitCode: 0,
          close: { ok: true, value: { errors: [], idleErrors: [], pools: [] } },
        };
      },
    };
  });
  // SQL-shape fixture for the driver's immutable inspection protocol only.
  const installer = {
    query: async (sql: string) => {
      if (sql.includes(')commands,'))
        return {
          rows: [
            {
              world_version: committed ? '1' : '0',
              event_sequence: committed ? '1' : '0',
              commands:
                options.mutateCounts && startAttempted
                  ? '99'
                  : committed
                    ? '1'
                    : '0',
              receipts: committed ? '1' : '0',
              events: committed ? '1' : '0',
              batches: '0',
              inventory: '0',
              queues: committed ? '1' : '0',
            },
          ],
        };
      if (sql.startsWith('select world_version::text'))
        return {
          rows: [
            {
              world_version: committed ? '1' : '0',
              event_sequence: committed ? '1' : '0',
            },
          ],
        };
      if (!committed || !sql.includes('from world_v2.command_submission'))
        throw Error('UNEXPECTED_SQL');
      return {
        rows: [
          {
            country_id: 'COUNTRY_02',
            command_type: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
            command_fingerprint: fingerprint,
            office_id: 'INDUSTRY',
            authority_kind: 'DISCRETIONARY_USER',
            queue_state: 'FINALIZED',
            receipt_count: 1,
            outcome: 'COMMITTED',
            world_version_before: '0',
            world_version_after: '1',
            receipt_event_ids: ['EVENT_ONE'],
            events: [
              {
                id: 'EVENT_ONE',
                type: 'RUN',
                sequence: '1',
                hash: eventHash,
                raw: eventRaw,
              },
            ],
            financial: [],
            inventory: [],
          },
        ],
      };
    },
  } as unknown as Pick<Pool, 'query'>;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const endpoint = new URL(url).pathname;
      calls.push(endpoint + ':' + generation);
      const state =
        endpoint === '/v1/command-recovery'
          ? {
              status: 'FINAL',
              receipt: {
                outcome: 'COMMITTED',
                commandId: 'RUN_ONE',
                commandFingerprint: fingerprint,
              },
            }
          : committed
            ? {
                status: 'FINALIZED',
                source: 'EXISTING',
                submitted: false,
                commandFingerprint: fingerprint,
              }
            : {
                status: 'QUEUED',
                source: 'NEW',
                queued: true,
                submitted: true,
                commandId: 'RUN_ONE',
                commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
                commandFingerprint: fingerprint,
              };
      return new Response(JSON.stringify({ ok: true, state }), {
        status: committed ? 200 : 202,
      });
    }),
  );
  const driver = createRegisteredFinalDriver({
    repositoryRoot: path.resolve(import.meta.dirname, '../..'),
    evidenceDirectory,
    worldId: 'WORLD_PROTOCOL_ONLY',
    installer,
    allowedOrigin: 'https://pages-test.example',
    signToken: () => 'PROTOCOL_NOT_A_JWT',
  });
  return { driver, calls };
}

describe('registered MANUAL_FINITE driver protocol', () => {
  it.each([true, false])(
    'keeps START forbidden, consumes once, drains, and recovers FINAL on a new OS (duplicateProbe=%s)',
    async (duplicateProbe) => {
      const { driver: d, calls } = await protocol();
      await d.launch({ classification: 'PROTOCOL_ONLY' });
      await d.assertPreparationStartDenied();
      const original = await d.makeRequest({
        countryId: 'COUNTRY_02',
        officeId: 'INDUSTRY',
        commandId: 'RUN_ONE',
        commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
        idempotencyKey: 'KEY_ONE',
        payload: {},
      });
      const fp = await d.submit(original);
      await d.consume('RUN_ONE', {
        commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
        countryId: 'COUNTRY_02',
        fingerprint: fp,
        financialBatches: 0,
        inventoryPostings: 0,
      });
      await d.stop();
      await d.launch({ classification: 'PROTOCOL_ONLY_NEW_OS' });
      await d.assertPreparationStartDenied();
      await d.recover(original, { duplicateProbe });
      await d.stop();
      expect(calls).toEqual([
        'INIT:1',
        'STATE:1',
        'START:1',
        'STATE:1',
        '/v1/office-command:1',
        'CONSUME:1',
        'CLOSE:1',
        'INIT:2',
        'STATE:2',
        'START:2',
        'STATE:2',
        '/v1/command-recovery:2',
        ...(duplicateProbe ? ['/v1/office-command:2'] : []),
        'CLOSE:2',
      ]);
    },
  );

  it.each([{ stateAfterStart: 'READY' }, { mutateCounts: true }])(
    'rejects a denial that mutates lifecycle or economy: %j',
    async (options) => {
      const { driver } = await protocol(denied, options);
      await driver.launch({ classification: 'PROTOCOL_ONLY' });
      try {
        await expect(driver.assertPreparationStartDenied()).rejects.toThrow(
          'START_DENIAL_MUST_PRESERVE_PREPARED_READY_AND_ECONOMY',
        );
      } finally {
        await driver.stop();
      }
    },
  );

  it.each([
    { ok: true, value: { started: true } },
    {
      ok: false,
      error: { name: 'Error', code: 'ETIMEDOUT', message: 'timeout' },
    },
    {
      ok: false,
      error: { ...denied.error, message: 'Another domain failure' },
    },
  ])(
    'rejects successful activation or unrelated failures: %j',
    async (reply) => {
      const { driver } = await protocol(reply);
      await driver.launch({ classification: 'PROTOCOL_ONLY' });
      try {
        await expect(driver.assertPreparationStartDenied()).rejects.toThrow();
      } finally {
        await driver.stop();
      }
    },
  );
});
