/** Fixed deployment assembly. Credentials are platform environment bindings;
 * the configuration file contains only reviewed identities and immutable pins. */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { parseOpeningSeed } from '@econmind/core';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
} from '@econmind/world-worker/social-runtime-connection';
import {
  createPostgresFinanceBudgetWorldCapacitySource,
  PostgresSqlDatabase,
} from '@econmind/world-worker/finance-budget-runtime';
import {
  createRegisteredWorldExecutionClock,
  createServerCommandHostBinding,
} from '@econmind/world-worker/runtime-command-host';
import { createProductionPostwarFinanceSocialRuntimeConnection } from '@econmind/world-worker/finance-social-runtime-connection';
import { createPostgresWorldActorResolver } from '../integration/postgres-world-actor-registry.js';
import { startRegisteredPostwarOfficeNodeBootstrap } from './registered-postwar-office-node-bootstrap.js';
import { ownedPool } from './postwar-office-node-bootstrap.js';
import {
  parseRegisteredNodeConfiguration,
  registeredNodeDatabaseUrls,
} from './registered-node-configuration.js';

const sha = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

export async function startConfiguredRegisteredNodeService(input: {
  readonly repositoryRoot: string;
  readonly configurationPath: string;
  readonly environment: NodeJS.ProcessEnv;
}) {
  const c = parseRegisteredNodeConfiguration(
    await readFile(input.configurationPath, 'utf8'),
  );
  if (input.environment.ECONMIND_ENV !== c.environment)
    throw Error('NODE_EXACT_ENVIRONMENT_REQUIRED');
  const urls = registeredNodeDatabaseUrls(input.environment);
  if ((await stat(c.seedPath)).size > 256 * 1024 * 1024)
    throw Error('NODE_SEED_ARTIFACT_TOO_LARGE');
  const bytes = await readFile(c.seedPath);
  if (sha(bytes) !== c.seedFileSha256)
    throw Error('NODE_SEED_FILE_HASH_MISMATCH');
  const seed = parseOpeningSeed(JSON.parse(bytes.toString('utf8')), sha);
  if (seed.worldId !== c.read.admittedWorldPins.worldId)
    throw Error('NODE_SEED_WORLD_MISMATCH');
  const [openingAdoption, policyBytes, userReceiptBytes] = await Promise.all([
    loadPostwarSocialConnectionOpeningAdoption(input.repositoryRoot),
    readFile(
      path.join(
        input.repositoryRoot,
        'config/postwar-genesis/day-one-fx.v1.json',
      ),
      'utf8',
    ),
    readFile(
      path.join(
        input.repositoryRoot,
        'docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
      ),
      'utf8',
    ),
  ]);
  const pool = (connectionString: string) =>
    ownedPool(
      new Pool({
        connectionString,
        ssl: { rejectUnauthorized: true },
        max: 2,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        application_name: 'econmind-registered-node',
      }),
    );
  const pools = {
    read: pool(urls.read),
    intake: pool(urls.intake),
    source: pool(urls.source),
    worker: pool(urls.worker),
    publication: pool(urls.publication),
  };
  let source:
    ReturnType<typeof createPostwarSocialRuntimeConnection> | undefined;
  let binding:
    | ReturnType<typeof createProductionPostwarFinanceSocialRuntimeConnection>
    | undefined;
  let node:
    | Awaited<ReturnType<typeof startRegisteredPostwarOfficeNodeBootstrap>>
    | undefined;
  let closing: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    closing ??= (async () => {
      const errors: unknown[] = [];
      for (const stop of [
        () => node?.shutdown(),
        () => binding?.stop(),
        () => source?.close(),
      ])
        try {
          await stop();
        } catch (error) {
          errors.push(error);
        }
      const ended = await Promise.allSettled(
        Object.values(pools).map((p) => p.end()),
      );
      for (const result of ended)
        if (result.status === 'rejected') errors.push(result.reason);
      if (errors.length)
        throw new AggregateError(errors, 'CONFIGURED_NODE_CLEANUP_UNCONFIRMED');
    })();
    return closing;
  };
  try {
    source = createPostwarSocialRuntimeConnection({
      worldId: seed.worldId,
      workerId: c.workerId,
      workerPool: pools.worker,
      workerRole: c.roles.worker,
      openingAdoption,
    });
    const clock = createRegisteredWorldExecutionClock({
      database: source.database,
      worldId: seed.worldId,
      workerId: c.workerId,
      registrationRef: c.executionRegistrationRef,
    });
    const actorResolver = createPostgresWorldActorResolver({
      pool: pools.read,
      worldId: seed.worldId,
      readerRole: c.roles.actor,
    });
    const resolveActorId = actorResolver.resolveActorId;
    const server = createServerCommandHostBinding({
      worldId: seed.worldId,
      workerId: c.workerId,
      seedRef: c.read.admittedWorldPins.seedRef,
      contentHash: c.read.admittedWorldPins.contentHash,
      admissionRef: c.read.admittedWorldPins.admissionRef,
      modelVersion: c.read.modelVersion,
      intakePool: pools.intake,
      sourcePool: pools.source,
      readerRole: c.roles.source,
      authorizationPublisherRole: c.read.authorizationPublisherRole,
      workerDatabase: source.database,
      clock,
      resolveActorId,
      readers: source.readers,
      socialRuntimeConnection: source,
      socialMetadataRead: { pool: pools.read, readerRole: c.read.readerRole },
      financeCapacitySource: createPostgresFinanceBudgetWorldCapacitySource({
        worldId: seed.worldId,
        countries: c.countries,
        historyMode: 'BUDGET_SOCIAL',
      }),
    });
    binding = createProductionPostwarFinanceSocialRuntimeConnection({
      binding: server,
      environment: c.environment,
      publicationDatabase: new PostgresSqlDatabase(pools.publication),
      treasuryFx: { workerRole: c.roles.worker },
      captain: { workerRole: c.roles.worker, mode: 'OFFICIAL_RUNTIME' },
    });
    node = await startRegisteredPostwarOfficeNodeBootstrap({
      binding,
      api: {
        environment: c.environment,
        host: '0.0.0.0',
        port: c.port,
        shutdownGraceMs: 5000,
      },
      social: {
        environment: c.environment,
        boundedReadPool: pools.read,
        intakePool: pools.intake,
        sourcePool: pools.source,
        workerPool: pools.worker,
        boundedReaderRole: c.read.readerRole,
        sourceReaderRole: c.roles.source,
        intakeRole: c.roles.intake,
        workerRole: c.roles.worker,
        authorizationPublisherRole: c.read.authorizationPublisherRole,
        workerId: c.workerId,
        openingAdoption,
        admittedWorldPins: c.read.admittedWorldPins,
        modelVersion: c.read.modelVersion,
        auth: c.read.auth,
        clock,
        resolveActorId,
        allowedOrigins: c.read.routeOptions.allowedOrigins,
      },
      socialStartupSeed: seed,
      treasuryFxPreparation: { seed, policyBytes, userReceiptBytes },
      read: c.read,
      financeAllowedOrigins: c.read.routeOptions.allowedOrigins,
    });
    const started = node;
    return Object.freeze({
      ...started,
      ready: () => !closing && started.ready(),
      shutdown,
    });
  } catch (error) {
    try {
      await shutdown();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        'CONFIGURED_NODE_STARTUP_AND_CLEANUP_FAILED',
        { cause: cleanup },
      );
    }
    throw error;
  }
}
