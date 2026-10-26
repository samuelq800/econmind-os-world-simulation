/** Source-only scope; actual World effects require C/G's independently reviewed consumer. */
import { types } from 'node:util';
import { canonicalSerialize } from '@econmind/core';
import { PostgresSqlDatabase } from './postgres-sql-database.js';
import type { SqlExecutor } from './sql-database.js';
import {
  parseSocialOfficeSimulatedSourceRequest,
  readSocialOfficeSimulatedSourceFrom,
  type SocialOfficeSimulatedSourceRequest,
  type SocialOfficeSimulatedSourceSnapshot,
} from './social-office-simulated-source-custody.js';

export async function withSocialOfficeSimulatedSourceTransaction<Result>(
  input: Readonly<{
    database: PostgresSqlDatabase;
    request: Readonly<SocialOfficeSimulatedSourceRequest>;
  }>,
  consume: (
    scope: Readonly<{
      executor: SqlExecutor;
      source: Readonly<SocialOfficeSimulatedSourceSnapshot>;
      assertCurrent(): Promise<void>;
    }>,
  ) => Promise<Result>,
): Promise<Result> {
  if (
    !input ||
    types.isProxy(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw Error('SOCIAL_SIMULATED_SOURCE: own composition required');
  const ds = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(ds).length !== 2 ||
    !['database', 'request'].every(
      (k) => ds[k] && Object.hasOwn(ds[k], 'value') && ds[k]!.enumerable,
    )
  )
    throw Error('SOCIAL_SIMULATED_SOURCE: closed composition required');
  const database = ds.database!.value as PostgresSqlDatabase;
  if (
    !database ||
    types.isProxy(database) ||
    Object.getPrototypeOf(database) !== PostgresSqlDatabase.prototype ||
    typeof consume !== 'function'
  )
    throw Error('SOCIAL_SIMULATED_SOURCE: original adapter required');
  // Capture before adapter.connect() can yield; no mutable request alias escapes.
  const captured = parseSocialOfficeSimulatedSourceRequest(ds.request!.value);
  return PostgresSqlDatabase.prototype.transaction.call(
    database,
    async (executor: SqlExecutor) => {
      const source = await readSocialOfficeSimulatedSourceFrom(
        executor,
        captured,
      );
      let active = true;
      const expected = Object.freeze({
        ...source.request,
        expectedGeneration: source.generation,
        expectedManifestHash: source.manifestHash,
      });
      const assertCurrent = async () => {
        if (!active) throw Error('SOCIAL_SIMULATED_SOURCE: ended scope');
        const current = await readSocialOfficeSimulatedSourceFrom(
          executor,
          expected,
        );
        if (
          !active ||
          canonicalSerialize(current.publication) !==
            canonicalSerialize(source.publication)
        )
          throw Error('SOCIAL_SIMULATED_SOURCE: changed or ended source scope');
      };
      try {
        return await consume(
          Object.freeze({ executor, source, assertCurrent }),
        );
      } finally {
        active = false;
      }
      // The adapter COMMIT/ROLLBACK is OUTSIDE this callback: DB locks persist.
    },
  ) as Promise<Result>;
}
