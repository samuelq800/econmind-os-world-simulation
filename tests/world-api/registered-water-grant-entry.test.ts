/** CLI wiring only. These controlled service responses are not evidence of
 * source publication, a native GRANT commit, water delivery or wages paid. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRegisteredNodeArguments } from '../../apps/world-api/src/runtime/registered-node-arguments.js';

const ports = vi.hoisted(() => ({ start: vi.fn(), consume: vi.fn() }));
vi.mock('../../apps/world-api/src/runtime/registered-node-service.js', () => ({
  startConfiguredRegisteredNodeService: ports.start,
}));
vi.mock(
  '../../apps/world-api/src/runtime/registered-consumer-runner.js',
  () => ({
    runRegisteredConsumer: ports.consume,
  }),
);

const scope = {
  countryId: 'COUNTRY_10',
  facilityId: 'OPEN-10-REFINED_FUEL',
  runId: 'RUN_EXISTING_10',
};
const args = [
  '/run/econmind/node.json',
  '--publish-water-grant',
  scope.countryId,
  scope.facilityId,
  scope.runId,
];
const command = {
  commandId: 'COMMAND_INDUSTRY_WATER_GRANT_' + 'A'.repeat(64),
  fingerprint: 'sha256:' + 'b'.repeat(64),
  countryId: scope.countryId,
};
const savedArgv = process.argv;
const savedExitCode = process.exitCode;
let signals: Map<'SIGINT' | 'SIGTERM', NodeJS.SignalsListener[]>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  signals = new Map(
    (['SIGINT', 'SIGTERM'] as const).map((name) => [
      name,
      process.listeners(name),
    ]),
  );
  process.exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const [name, previous] of signals)
    for (const listener of process.listeners(name))
      if (!previous.includes(listener)) process.removeListener(name, listener);
  process.argv = savedArgv;
  process.exitCode = savedExitCode;
  vi.restoreAllMocks();
});
async function main(argv = args) {
  process.argv = ['node', 'registered-main.js', ...argv];
  await import('../../apps/world-api/src/registered-main.js');
}
function service() {
  const result = {
    worldId: 'WORLD_CONTROLLED_ENTRY_TEST',
    port: 1234,
    publishIndustryWaterGrant: vi.fn(async () => ({
      status: 'QUEUED' as 'QUEUED' | 'FINAL',
      command,
    })),
    shutdown: vi.fn(async () => undefined),
    consumer: { consumeOnce: vi.fn() },
  };
  ports.start.mockResolvedValue(result);
  return result;
}

describe('explicit registered water grant entry', () => {
  it('preserves HTTP and finite consumer choices, with an independent exact water scope', () => {
    expect(parseRegisteredNodeArguments(args)).toEqual({
      configurationPath: args[0],
      action: { kind: 'PUBLISH_WATER_GRANT', scope },
    });
    expect(parseRegisteredNodeArguments([args[0]!]).action).toEqual({
      kind: 'HTTP',
    });
    expect(
      parseRegisteredNodeArguments([args[0]!, '--consume', '1000']).action,
    ).toEqual({ kind: 'CONSUME', maxSteps: 1000 });
  });
  it.each([
    args.slice(0, -1),
    [...args, '--consume', '1'],
    [...args, '--quota', '100'],
    [...args, '--sim-time', '0'],
    [args[0]!, args[1]!, 'COUNTRY_71', args[3]!, args[4]!],
    [args[0]!, args[1]!, args[2]!, '', args[4]!],
    [args[0]!, '--consume', '1001'],
    ['relative.json', ...args.slice(1)],
  ])(
    'rejects malformed or conflicting arguments before opening connections: %j',
    async (...bad) => {
      await main(bad);
      expect(ports.start).not.toHaveBeenCalled();
      expect(ports.consume).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    },
  );
  it('publishes exactly once, reports QUEUED without claiming a right, and drains without consuming', async () => {
    const s = service();
    await main();
    expect(s.publishIndustryWaterGrant).toHaveBeenCalledExactlyOnceWith(scope);
    expect(ports.consume).not.toHaveBeenCalled();
    expect(s.consumer.consumeOnce).not.toHaveBeenCalled();
    expect(s.shutdown).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'REGISTERED_WATER_GRANT_PUBLICATION',
        status: 'QUEUED',
        commandId: command.commandId,
        commandFingerprint: command.fingerprint,
        countryId: scope.countryId,
        consumerStarted: false,
        clockStarted: false,
      }),
    );
  });
  it('passes an unchanged scope to existing publication recovery and preserves the original FINAL identity', async () => {
    const s = service();
    s.publishIndustryWaterGrant.mockResolvedValue({ status: 'FINAL', command });
    await main();
    vi.resetModules();
    await main();
    expect(s.publishIndustryWaterGrant.mock.calls).toEqual([[scope], [scope]]);
    expect(ports.consume).not.toHaveBeenCalled();
    const records = vi
      .mocked(console.log)
      .mock.calls.map(([value]) => JSON.parse(String(value)));
    const publications = records.filter(
      (v) => v.event === 'REGISTERED_WATER_GRANT_PUBLICATION',
    );
    expect(publications).toHaveLength(2);
    expect(publications[0]).toEqual(publications[1]);
    expect(publications[0]).toMatchObject({
      status: 'FINAL',
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
    });
  });
  it('stops after an unknown outcome without retrying or leaking provider detail', async () => {
    const s = service();
    s.publishIndustryWaterGrant.mockRejectedValue(
      Error('connection lost after COMMIT: postgres://private-test-only'),
    );
    await main();
    expect(s.publishIndustryWaterGrant).toHaveBeenCalledTimes(1);
    expect(ports.consume).not.toHaveBeenCalled();
    expect(s.shutdown).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'REGISTERED_WATER_GRANT_PUBLICATION_STOPPED',
        code: 'WATER_GRANT_PUBLICATION_REQUIRES_RECOVERY',
      }),
    );
    expect(process.exitCode).toBe(1);
  });
  it('leaves default HTTP startup and explicit consumption behavior intact', async () => {
    const s = service();
    await main([args[0]!]);
    expect(s.publishIndustryWaterGrant).not.toHaveBeenCalled();
    expect(ports.consume).not.toHaveBeenCalled();
    vi.resetModules();
    await main([args[0]!, '--consume', '2']);
    expect(ports.consume).toHaveBeenCalledWith(
      expect.objectContaining({ consumer: s.consumer, maxSteps: 2 }),
    );
    expect(s.publishIndustryWaterGrant).not.toHaveBeenCalled();
  });
});
