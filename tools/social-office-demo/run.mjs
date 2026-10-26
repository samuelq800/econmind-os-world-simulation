/** Fixed isolated entry. F owns installation, listener, private controller and cleanup. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { startIsolatedSocialOfficeHost } from './host.mjs';

export async function startSocialOfficeDemo() {
  if (arguments.length !== 0)
    throw Error('Fixed isolated host only; overrides are forbidden');
  return startIsolatedSocialOfficeHost();
}

async function main() {
  if (process.argv.slice(2).join('|') !== '--isolated')
    throw Error('Use --isolated; no source, identity, path or time overrides');
  const host = await startSocialOfficeDemo();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let closing = false;
  let closePromise = null;
  const close = () => {
    if (closePromise) return closePromise;
    closing = true;
    lines.close();
    closePromise = (async () => {
      const result = await host.close();
      process.stdout.write(
        `${JSON.stringify({ event: 'OWNED_CLOSE_RETURNED', report: result ?? null })}\n`,
      );
    })();
    return closePromise;
  };
  const interrupt = () => {
    void close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    process.stdout.write(
      `${JSON.stringify({ event: 'ISOLATED_SOCIAL_HOST', origin: host.origin, commands: ['next', 'due', 'close'], scope: 'ONE_SELECTED_SOCIAL_SIMULATION_NOT_ADOPTED_WORLD_POLICY' })}\n`,
    );
    for await (const line of lines) {
      if (closing) break;
      if (line === 'close') break;
      if (line === 'next')
        process.stdout.write(
          `${JSON.stringify({ event: 'ACTUAL_SOURCE_PRESET', result: await host.advanceToNextPreset() })}\n`,
        );
      else if (line === 'due')
        process.stdout.write(
          `${JSON.stringify({ event: 'ACTUAL_AUTOMATIC_RESULT', result: await host.processDueBoundary() })}\n`,
        );
      else
        process.stdout.write(
          `${JSON.stringify({ event: 'COMMAND_REFUSED', allowed: ['next', 'due', 'close'] })}\n`,
        );
    }
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    process.stderr.write(
      'ISOLATED_SOCIAL_RUN_FAILED: preserve original request identities and owned cleanup evidence.\n',
    );
    process.exitCode = 1;
  });
}
