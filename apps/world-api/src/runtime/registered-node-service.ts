import { loadPostwarIndustryRuntimeSourceContext } from '@econmind/world-worker/postwar-industry-runtime-source';
/** Fixed deployment assembly. Credentials are platform environment bindings;
 * the configuration file contains only reviewed identities and immutable pins. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
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
import {
  createProductionPostwarFinanceSocialRuntimeConnection,
  type PostwarFinanceSocialRuntimeConnection,
} from '@econmind/world-worker/finance-social-runtime-connection';
import { createPostgresWorldActorResolver } from '../integration/postgres-world-actor-registry.js';
import { startRegisteredPostwarOfficeNodeBootstrap } from './registered-postwar-office-node-bootstrap.js';
import { ownedPool } from './postwar-office-node-bootstrap.js';
import {
  parseRegisteredNodeConfiguration,
  registeredNodeDatabaseUrls,
} from './registered-node-configuration.js';
import {
  loadRegisteredNodeStartupArtifacts,
  retireRegisteredNodeRentSourceAfterDrain,
} from './registered-node-beneficial-rent-loader.js';

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
  const urls = registeredNodeDatabaseUrls(input.environment, {
    industryPublisher: c.install?.industry === true,
  });
  const loaded = await loadRegisteredNodeStartupArtifacts({
    seedPath: c.seedPath,
    seedFileSha256: c.seedFileSha256,
    worldId: c.read.admittedWorldPins.worldId,
    ...(c.beneficialRent ? { beneficialRent: c.beneficialRent } : {}),
  });
  const seed = loaded.seed,
    rentSource = loaded.beneficialRentSource;
  const createdPools: ReturnType<typeof ownedPool>[] = [];
  const pool = (connectionString: string) => {
    const owned = ownedPool(
      new Pool({
        connectionString,
        ssl: { rejectUnauthorized: true },
        max: 2,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        application_name: 'econmind-registered-node',
      }),
    );
    createdPools.push(owned);
    return owned;
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
  let proofExposedToOwner = false;
  const shutdown = (): Promise<void> => {
    closing ??= (async () => {
      const errors: unknown[] = [];
      let drained = !binding;
      for (const stop of [
        () => node?.shutdown(),
        async () => {
          if (binding) {
            await binding.stop();
            drained = true;
          } else await source?.close();
        },
      ])
        try {
          await stop();
        } catch (error) {
          errors.push(error);
        }
      if (drained) {
        const ended = await Promise.allSettled(
          createdPools.map((p) => p.end()),
        );
        for (const result of ended)
          if (result.status === 'rejected') errors.push(result.reason);
      }
      if (rentSource && (drained || !proofExposedToOwner)) {
        try {
          retireRegisteredNodeRentSourceAfterDrain(rentSource);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, 'CONFIGURED_NODE_CLEANUP_UNCONFIRMED');
    })();
    return closing;
  };
  try {
    const industryContext = c.install?.industry
      ? await loadPostwarIndustryRuntimeSourceContext(input.repositoryRoot)
      : undefined;
    const [openingAdoption, policyBytes, userReceiptBytes] = await Promise.all([
      industryContext
        ? Promise.resolve(industryContext.labourSocial)
        : loadPostwarSocialConnectionOpeningAdoption(input.repositoryRoot),
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
    const pools = {
      read: pool(urls.read),
      intake: pool(urls.intake),
      source: pool(urls.source),
      worker: pool(urls.worker),
      publication: pool(urls.publication),
      industryPublication: urls.industryPublication
        ? pool(urls.industryPublication)
        : null,
    };
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
      ...(c.install?.centralBankOmo
        ? {
            centralBankOmo: {
              workerRole: c.roles.worker,
              countryIds: c.countries.map((v) => v.countryId),
              mode: 'OFFICIAL_RUNTIME' as const,
            },
          }
        : {}),
      ...(c.install?.trade ? { trade: { workerRole: c.roles.worker } } : {}),
      ...(industryContext
        ? {
            industry: {
              sourceContext: industryContext,
              ...(c.install?.industryUtilities
                ? {
                    utilityPreparation: {
                      repositoryRoot: input.repositoryRoot,
                      startupSeed: seed,
                      ...(rentSource
                        ? { startupBeneficialHousingRentSource: rentSource }
                        : {}),
                    },
                  }
                : {}),
              ...(pools.industryPublication
                ? {
                    publicationDatabase: new PostgresSqlDatabase(
                      pools.industryPublication,
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(c.install?.industryLabour || c.install?.industry
        ? { industryLabour: { enabled: true as const } }
        : {}),
      ...(c.beneficialRent
        ? {
            beneficialRent: {
              workerRole: c.roles.worker,
              clockBindingRef: c.beneficialRent.clockBindingRef,
            },
          }
        : {}),
    });
    proofExposedToOwner = rentSource !== undefined;
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
      ...(rentSource
        ? { socialStartupBeneficialHousingRentSource: rentSource }
        : {}),
      treasuryFxPreparation: {
        seed,
        policyBytes,
        userReceiptBytes,
        ...(rentSource
          ? { startupBeneficialHousingRentSource: rentSource }
          : {}),
      },
      read: c.read,
      financeAllowedOrigins: c.read.routeOptions.allowedOrigins,
    });
    const started = node,
      shared = binding;
    return Object.freeze({
      ...started,
      ready: () => !closing && started.ready(),
      publishDueIndustryWork(
        scope: Readonly<{
          countryId: string;
          facilityId: string;
          runId: string;
        }>,
      ): ReturnType<
        PostwarFinanceSocialRuntimeConnection['publishDueIndustryWork']
      > {
        if (closing || !started.ready())
          throw Error('CONFIGURED_NODE_NOT_READY');
        return shared.publishDueIndustryWork(scope);
      },
      publishIndustryWaterGrant(
        scope: Readonly<{
          countryId: string;
          facilityId: string;
          runId: string;
        }>,
      ): ReturnType<
        PostwarFinanceSocialRuntimeConnection['publishIndustryWaterGrant']
      > {
        if (closing || !started.ready())
          throw Error('CONFIGURED_NODE_NOT_READY');
        return shared.publishIndustryWaterGrant(scope);
      },
      publishIndustryDueWage(
        scope: Readonly<{
          countryId: string;
          facilityId: string;
          runId: string;
        }>,
      ): ReturnType<
        PostwarFinanceSocialRuntimeConnection['publishIndustryDueWage']
      > {
        if (closing || !started.ready())
          throw Error('CONFIGURED_NODE_NOT_READY');
        return shared.publishIndustryDueWage(scope);
      },
      shutdown,
    });
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    try {
      await shutdown();
    } catch (cleanup) {
      cleanupErrors.push(cleanup);
    }
    if (cleanupErrors.length)
      throw new AggregateError(
        [error, ...cleanupErrors],
        'CONFIGURED_NODE_STARTUP_AND_CLEANUP_FAILED',
        { cause: error },
      );
    throw error;
  }
}
