/** Source-only scope; actual World effects require C/G's independently reviewed consumer. */
import { types } from 'node:util';
import { canonicalSerialize } from '@econmind/core';
import { PostgresSqlDatabase } from './postgres-sql-database.js';
import type { SqlExecutor } from './sql-database.js';
import {
  parseSocialOfficeSimulatedSourceRequest,
  readSocialOfficeSimulatedSourceFrom,
  readSocialOfficeSimulatedRevisionFrom,
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

export interface SocialOfficeSimulationIdentity {
  readonly simulationId: string;
  readonly worldId: string;
  readonly countryId: string;
}
const activeSources = new WeakMap<
  SqlExecutor,
  Readonly<{
    identity: SocialOfficeSimulationIdentity;
    source: SocialOfficeSimulatedSourceSnapshot;
  }>
>();

/** Lookup only. No public registration or caller-supplied context token. */
export function requireSocialOfficeProtectedSource(
  executor: SqlExecutor,
  identity: SocialOfficeSimulationIdentity,
) {
  const entry = activeSources.get(executor);
  if (
    !entry ||
    canonicalSerialize(entry.identity) !== canonicalSerialize(identity)
  )
    throw Error(
      'SOCIAL_SIMULATED_SOURCE: missing active same-executor protection',
    );
  return entry.source;
}

/** Defers new-use eligibility until after immutable receipt recovery and S/Q locking. */
export async function withSocialOfficeSimulatedTransaction<Result>(
  input: Readonly<{
    database: PostgresSqlDatabase;
    identity: SocialOfficeSimulationIdentity;
  }>,
  consume: (
    scope: Readonly<{
      executor: SqlExecutor;
      peekSource(): ReturnType<typeof readSocialOfficeSimulatedRevisionFrom>;
      protectSource(
        request: Pick<
          SocialOfficeSimulatedSourceRequest,
          'purpose' | 'simTime' | 'expectedGeneration' | 'expectedManifestHash'
        >,
      ): Promise<
        Readonly<{
          source: SocialOfficeSimulatedSourceSnapshot;
          assertCurrent(): Promise<void>;
        }>
      >;
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
    !['database', 'identity'].every(
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
  const rawIdentity = ds.identity!.value as unknown;
  if (
    !rawIdentity ||
    typeof rawIdentity !== 'object' ||
    types.isProxy(rawIdentity) ||
    Object.getPrototypeOf(rawIdentity) !== Object.prototype
  )
    throw Error('SOCIAL_SIMULATED_SOURCE: own identity required');
  const identityDescriptors = Object.getOwnPropertyDescriptors(rawIdentity);
  if (
    Reflect.ownKeys(identityDescriptors).length !== 3 ||
    !['simulationId', 'worldId', 'countryId'].every(
      (k) =>
        identityDescriptors[k] &&
        Object.hasOwn(identityDescriptors[k], 'value') &&
        identityDescriptors[k]!.enumerable,
    )
  )
    throw Error('SOCIAL_SIMULATED_SOURCE: closed identity required');
  const identityValues = Object.fromEntries(
    ['simulationId', 'worldId', 'countryId'].map((k) => [
      k,
      identityDescriptors[k]!.value,
    ]),
  );
  const captured = parseSocialOfficeSimulatedSourceRequest({
    schemaVersion: 'social-office-simulated-source-request-v1',
    sourceClass: 'SIMULATED_OPENING',
    ...identityValues,
    purpose: 'EMPLOYMENT',
    simTime: '0',
    expectedGeneration: null,
    expectedManifestHash: null,
  });
  const identity = Object.freeze({
    simulationId: captured.simulationId,
    worldId: captured.worldId,
    countryId: captured.countryId,
  });
  return PostgresSqlDatabase.prototype.transaction.call(
    database,
    async (executor: SqlExecutor) => {
      let active = true;
      const assertActive = () => {
        if (!active) throw Error('SOCIAL_SIMULATED_SOURCE: ended scope');
      };
      const peekSource = async () => {
        assertActive();
        const result = await readSocialOfficeSimulatedRevisionFrom(
          executor,
          identity,
        );
        assertActive();
        return result;
      };
      const protectSource = async (
        request: Pick<
          SocialOfficeSimulatedSourceRequest,
          'purpose' | 'simTime' | 'expectedGeneration' | 'expectedManifestHash'
        >,
      ) => {
        assertActive();
        const capturedRequest = parseSocialOfficeSimulatedSourceRequest({
          schemaVersion: 'social-office-simulated-source-request-v1',
          sourceClass: 'SIMULATED_OPENING',
          ...identity,
          ...request,
        });
        const source = await readSocialOfficeSimulatedSourceFrom(
          executor,
          capturedRequest,
        );
        assertActive();
        activeSources.set(executor, Object.freeze({ identity, source }));
        const assertCurrent = async () => {
          assertActive();
          const current = await readSocialOfficeSimulatedSourceFrom(executor, {
            ...capturedRequest,
            expectedGeneration: source.generation,
            expectedManifestHash: source.manifestHash,
          });
          assertActive();
          if (
            canonicalSerialize(current) !==
            canonicalSerialize({ ...source, request: current.request })
          )
            throw Error('SOCIAL_SIMULATED_SOURCE: changed source');
        };
        return Object.freeze({ source, assertCurrent });
      };
      try {
        return await consume(
          Object.freeze({ executor, peekSource, protectSource }),
        );
      } finally {
        active = false;
        activeSources.delete(executor);
      }
    },
  ) as Promise<Result>;
}
