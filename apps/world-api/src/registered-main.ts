/** Dedicated, explicit registered host entry. The ordinary dev launcher stays
 * separate. Starting this process does not start World/Clock or a consumer loop. */
import { fileURLToPath } from 'node:url';
import { startConfiguredRegisteredNodeService } from './runtime/registered-node-service.js';

let service:
  Awaited<ReturnType<typeof startConfiguredRegisteredNodeService>> | undefined;
let stopping = false;
let shutdown: Promise<void> | undefined;
const stop = () => {
  stopping = true;
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
  if (process.argv.length !== 3 || !process.argv[2]?.startsWith('/'))
    throw Error('ABSOLUTE_NODE_CONFIGURATION_PATH_REQUIRED');
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
        consumerStarted: false,
        clockStarted: false,
      }),
    );
  }
} catch (error) {
  // Provider errors may carry DSNs, SQL parameters or credential metadata.
  // Emit only a bounded product error code; never dump an arbitrary exception.
  const message = error instanceof Error ? error.message : '';
  console.error(
    JSON.stringify({
      event: 'REGISTERED_NODE_STARTUP_FAILED',
      code: /^[A-Z][A-Z0-9_:]{0,180}$/u.test(message)
        ? message
        : 'STARTUP_DEPENDENCY_FAILED',
    }),
  );
  process.exitCode = 1;
  stop();
  await shutdown;
}
