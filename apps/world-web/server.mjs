import { createServer } from 'vite';

let server;
let stopping = false;

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(
    JSON.stringify({ event: 'SHUTDOWN_START', service: 'world-web', signal }),
  );
  await server?.close();
  console.log(
    JSON.stringify({
      event: 'SHUTDOWN_COMPLETE',
      service: 'world-web',
      signal,
    }),
  );
}

function beginShutdown(signal) {
  void shutdown(signal).catch((error) => {
    console.error(
      JSON.stringify({
        event: 'SHUTDOWN_FAILED',
        service: 'world-web',
        signal,
        error:
          error instanceof Error ? error.message : 'Unknown shutdown failure',
      }),
    );
    process.exitCode = 1;
  });
}

try {
  server = await createServer();
  await server.listen();
  server.printUrls();
  console.log(JSON.stringify({ event: 'LISTENING', service: 'world-web' }));
  process.once('SIGINT', () => beginShutdown('SIGINT'));
} catch (error) {
  await server?.close().catch(() => undefined);
  console.error(
    JSON.stringify({
      event: 'STARTUP_FAILED',
      service: 'world-web',
      error: error instanceof Error ? error.message : 'Unknown startup failure',
    }),
  );
  process.exitCode = 1;
}
