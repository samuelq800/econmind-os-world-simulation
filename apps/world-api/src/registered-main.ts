/** Dedicated registered host entry. Default is HTTP only; --consume N explicitly
 * runs a finite FIFO batch. Neither mode initializes a World or moves Clock. */
import { fileURLToPath } from 'node:url';
import { startConfiguredRegisteredNodeService } from './runtime/registered-node-service.js';
import { runRegisteredConsumer } from './runtime/registered-consumer-runner.js';

let service:
  Awaited<ReturnType<typeof startConfiguredRegisteredNodeService>> | undefined;
let stopping = false;
let shutdown: Promise<void> | undefined;
const consumerStop = new AbortController();
let consuming = false;
const stop = () => {
  stopping = true;
  consumerStop.abort();
  if (service) {
    shutdown ??= service.shutdown();
    void shutdown.catch(() => {
      console.error(
        JSON.stringify({ event: 'REGISTERED_NODE_SHUTDOWN_FAILED' }),
      );
      process.exitCode = 1;
    });
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  if (
    ![3, 5].includes(process.argv.length) ||
    !process.argv[2]?.startsWith('/') ||
    (process.argv.length === 5 &&
      (process.argv[3] !== '--consume' ||
        !/^[1-9][0-9]{0,3}$/u.test(process.argv[4] ?? '') ||
        Number(process.argv[4]) > 1000))
  )
    throw Error('ABSOLUTE_NODE_CONFIGURATION_PATH_REQUIRED');
  const consumeRequested = process.argv[3] === '--consume';
  service = await startConfiguredRegisteredNodeService({
    repositoryRoot: fileURLToPath(new URL('../../../', import.meta.url)),
    configurationPath: process.argv[2],
    environment: process.env,
  });
  if (stopping) {
    stop();
    await shutdown;
  } else {
    console.log(
      JSON.stringify({
        event: 'REGISTERED_NODE_HTTP_LISTENING',
        worldId: service.worldId,
        port: service.port,
        consumerStarted: consumeRequested,
        clockStarted: false,
      }),
    );
    if (consumeRequested) {
      consuming = true;
      await runRegisteredConsumer({
        consumer: service.consumer,
        signal: consumerStop.signal,
        maxSteps: Number(process.argv[4]),
        report: (observation) => console.log(JSON.stringify(observation)),
      });
      console.log(
        JSON.stringify({ event: 'REGISTERED_CONSUMER_BATCH_FINISHED' }),
      );
    }
  }
} catch (error) {
  // Provider errors may carry DSNs, SQL parameters or credential metadata.
  // Emit only a bounded product error code; never dump an arbitrary exception.
  const message = error instanceof Error ? error.message : '';
  console.error(
    JSON.stringify({
      event: consuming
        ? 'REGISTERED_NODE_CONSUMER_STOPPED'
        : 'REGISTERED_NODE_STARTUP_FAILED',
      code: /^[A-Z][A-Z0-9_:]{0,180}$/u.test(message)
        ? message
        : consuming
          ? 'REGISTERED_CONSUMER_REQUIRES_RECOVERY'
          : 'STARTUP_DEPENDENCY_FAILED',
    }),
  );
  process.exitCode = 1;
  stop();
  await shutdown;
}
