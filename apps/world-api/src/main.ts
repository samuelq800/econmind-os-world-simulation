import { runApiProcess } from './runtime.js';

try {
  await runApiProcess();
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'STARTUP_FAILED',
      service: 'world-api',
      error: error instanceof Error ? error.message : 'Unknown startup failure',
    }),
  );
  process.exitCode = 1;
}
