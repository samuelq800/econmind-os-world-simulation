import { createServer } from 'vite';

let server;
let shutdownPromise;

function shutdown(signal) {
  shutdownPromise ??= (async () => {
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
  })();
  return shutdownPromise;
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

process.on('SIGINT', () => beginShutdown('SIGINT'));
process.on('SIGTERM', () => beginShutdown('SIGTERM'));

try {
  server = await createServer();
  if (shutdownPromise === undefined) {
    await server.listen();
    if (shutdownPromise === undefined) {
      server.printUrls();
      console.log(JSON.stringify({ event: 'LISTENING', service: 'world-web' }));
    } else {
      await server.close();
    }
  } else {
    await server.close();
  }
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
