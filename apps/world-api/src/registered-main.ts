/** Dedicated registered host entry. Default is HTTP only; consumption and fixed
 * water-grant publication are separate explicit actions. No mode initializes
 * a World or moves Clock. */
import { fileURLToPath } from 'node:url';
import { startConfiguredRegisteredNodeService } from './runtime/registered-node-service.js';
import { runRegisteredConsumer } from './runtime/registered-consumer-runner.js';
import { parseRegisteredNodeArguments } from './runtime/registered-node-arguments.js';

let service:
  Awaited<ReturnType<typeof startConfiguredRegisteredNodeService>> | undefined;
let stopping = false;
let shutdown: Promise<void> | undefined;
const consumerStop = new AbortController();
let consuming = false;
let publishingWaterGrant = false;
let recoveringPublication = false;
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
  const { configurationPath, action } = parseRegisteredNodeArguments(
    process.argv.slice(2),
  );
  const consumeRequested = action.kind === 'CONSUME';
  service = await startConfiguredRegisteredNodeService({
    repositoryRoot: fileURLToPath(new URL('../../../', import.meta.url)),
    configurationPath,
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
    if (action.kind === 'RECOVER_PUBLICATION') {
      recoveringPublication = true;
      // Rebuild only derived views of an existing committed FINAL. The fixed
      // service verifies its original receipt and rechecks the current scope.
      const result = await service.retryDerivedPublication(action.commandId);
      console.log(
        JSON.stringify({
          event: 'REGISTERED_DERIVED_PUBLICATION_RECOVERY',
          result,
          consumerStarted: false,
          clockStarted: false,
        }),
      );
      if (result.status !== 'PUBLISHED') process.exitCode = 1;
      stop();
      await shutdown;
    } else if (action.kind === 'PUBLISH_WATER_GRANT') {
      publishingWaterGrant = true;
      // One explicit call only. The fixed publisher recovers an existing
      // publication before considering issuance. Unknown outcomes stop here.
      const result = await service.publishIndustryWaterGrant(action.scope);
      console.log(
        JSON.stringify({
          event: 'REGISTERED_WATER_GRANT_PUBLICATION',
          status: result.status,
          commandId: result.command.commandId,
          commandFingerprint: result.command.fingerprint,
          countryId: result.command.countryId,
          consumerStarted: false,
          clockStarted: false,
        }),
      );
      stop();
      await shutdown;
    } else if (action.kind === 'CONSUME') {
      consuming = true;
      await runRegisteredConsumer({
        consumer: service.consumer,
        signal: consumerStop.signal,
        maxSteps: action.maxSteps,
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
      event: recoveringPublication
        ? 'REGISTERED_DERIVED_PUBLICATION_RECOVERY_STOPPED'
        : publishingWaterGrant
          ? 'REGISTERED_WATER_GRANT_PUBLICATION_STOPPED'
          : consuming
            ? 'REGISTERED_NODE_CONSUMER_STOPPED'
            : 'REGISTERED_NODE_STARTUP_FAILED',
      code: /^[A-Z][A-Z0-9_:]{0,180}$/u.test(message)
        ? message
        : recoveringPublication
          ? 'DERIVED_PUBLICATION_REQUIRES_RETRY'
          : publishingWaterGrant
            ? 'WATER_GRANT_PUBLICATION_REQUIRES_RECOVERY'
            : consuming
              ? 'REGISTERED_CONSUMER_REQUIRES_RECOVERY'
              : 'STARTUP_DEPENDENCY_FAILED',
    }),
  );
  process.exitCode = 1;
  stop();
  await shutdown;
}
