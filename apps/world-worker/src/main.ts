import { runWorkerProcess } from './runtime.js';

try {
  await runWorkerProcess();
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'STARTUP_FAILED',
      service: 'world-worker',
      error: error instanceof Error ? error.message : 'Unknown startup failure',
    }),
  );
  process.exitCode = 1;
}
