/** Fixed isolated entry. F owns installation, listener, private controller and cleanup. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { types } from 'node:util';
import { canonicalSerialize } from '@econmind/core';

/** Diagnostic JSON keeps native numeric metadata and Core domain wire shapes. */
export function serializeSocialOfficeDemoEvidence(value) {
  const seen = new Set();
  const project = (current) => {
    if (typeof current === 'number') {
      if (!Number.isFinite(current))
        throw Error('Non-finite diagnostic number');
      return current;
    }
    try {
      // In particular, actual Core SimTime is its canonical tick string,
      // never an object containing its private bigint representation.
      return JSON.parse(canonicalSerialize(current));
    } catch (error) {
      if (
        current === null ||
        typeof current !== 'object' ||
        types.isProxy(current) ||
        seen.has(current)
      )
        throw error;
      const array = Array.isArray(current);
      if (
        Object.getPrototypeOf(current) !==
        (array ? Array.prototype : Object.prototype)
      )
        throw error;
      const descriptors = Object.getOwnPropertyDescriptors(current);
      const keys = Reflect.ownKeys(descriptors);
      if (
        keys.some(
          (key) =>
            typeof key !== 'string' ||
            (array && key === 'length'
              ? false
              : !descriptors[key].enumerable ||
                !Object.hasOwn(descriptors[key], 'value') ||
                (array && !/^(?:0|[1-9]\d*)$/u.test(key))),
        )
      )
        throw error;
      seen.add(current);
      try {
        if (array) {
          if (keys.length !== current.length + 1) throw error;
          return Array.from({ length: current.length }, (_, index) => {
            const descriptor = descriptors[String(index)];
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw error;
            return project(descriptor.value);
          });
        }
        return Object.fromEntries(
          keys.sort().map((key) => [key, project(descriptors[key].value)]),
        );
      } finally {
        seen.delete(current);
      }
    }
  };
  return JSON.stringify(project(value));
}

export async function startSocialOfficeDemo() {
  if (arguments.length !== 0)
    throw Error('Fixed isolated host only; overrides are forbidden');
  // The literal owned host import happens only when starting the real host.
  const { startIsolatedSocialOfficeHost } = await import('./host.mjs');
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
        `${serializeSocialOfficeDemoEvidence({ event: 'OWNED_CLOSE_RETURNED', report: result ?? null })}\n`,
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
      `${serializeSocialOfficeDemoEvidence({ event: 'ISOLATED_SOCIAL_HOST', origin: host.origin, commands: ['next', 'due', 'close'], scope: 'ONE_SELECTED_SOCIAL_SIMULATION_NOT_ADOPTED_WORLD_POLICY' })}\n`,
    );
    for await (const line of lines) {
      if (closing) break;
      if (line === 'close') break;
      if (line === 'next')
        process.stdout.write(
          `${serializeSocialOfficeDemoEvidence({ event: 'ACTUAL_SOURCE_PRESET', result: await host.advanceToNextPreset() })}\n`,
        );
      else if (line === 'due')
        process.stdout.write(
          `${serializeSocialOfficeDemoEvidence({ event: 'ACTUAL_AUTOMATIC_RESULT', result: await host.processDueBoundary() })}\n`,
        );
      else
        process.stdout.write(
          `${serializeSocialOfficeDemoEvidence({ event: 'COMMAND_REFUSED', allowed: ['next', 'due', 'close'] })}\n`,
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
