import { createPostwarSocialServiceCreationForSharedConnection } from './social-runtime-connection.js';
import {
  createPostwarIndustryUtilityRuntime,
  type PostwarIndustryUtilityRuntime,
} from '../persistence/postwar-industry-utility-runtime.js';
import {
  createPostwarIndustryLogisticsRuntime,
  type PostwarIndustryLogisticsRuntime,
} from '../persistence/postwar-industry-logistics-runtime.js';
import {
  preparePostwarIndustryUtilitySource,
  preparePostwarIndustryUtilitySources,
  retireUnownedPostwarIndustryUtilitySource,
  type PostwarIndustryUtilitySourceInput,
} from '../persistence/postwar-industry-utility-source.js';
import {
  createPostwarIndustryOperatingWageRuntime,
  type PostwarIndustryOperatingWageRuntime,
} from '../persistence/postwar-industry-operating-wage-runtime.js';
import { requirePostwarSocialRuntimePagedReplay } from './social-runtime-connection.js';
import {
  createPostwarIndustryWorkRuntime,
  type PostwarIndustryWorkRuntime,
} from '../persistence/postwar-industry-work-runtime.js';
import {
  createPostwarIndustryRunRuntime,
  type PostwarIndustryRunRuntime,
} from '../persistence/postwar-industry-run-runtime.js';
import { createPostwarIndustryIntakeAuthorizationPool } from '../persistence/postwar-industry-intake-authorization.js';
import { requirePostwarSocialSourceRevocationFence } from '../persistence/postwar-social-position-runtime.js';
import {
  createPostwarIndustryRuntime,
  type PostwarIndustryRuntime,
  type PostwarIndustryPreparedRun,
} from '../persistence/postwar-industry-runtime.js';
import type { PostwarPhysicalSourceContext } from '../preparation/postwar-physical-service-receipt.js';
import { createPostwarMixedCurrentProjectionSource } from '../persistence/postwar-mixed-current-projection-publication.js';
import {
  createPostwarBeneficialHousingRentRuntimeForSharedSource,
  type PostwarBeneficialHousingRentRuntime,
} from '../persistence/postwar-beneficial-housing-rent-runtime.js';
import { createPostwarBeneficialRentPreparationController } from './postwar-beneficial-rent-preparation.js';
import type { PreparedBeneficialHousingRentSource } from '../persistence/postwar-beneficial-housing-rent-source.js';
import { createManualOfficeAuthorizationTransactionDatabase } from '../persistence/manual-office-authorization-transaction-scope.js';
import {
  createPostwarCentralBankOmoWorldRuntime,
  type PostwarCentralBankOmoWorldRuntime,
} from '../persistence/postwar-central-bank-omo-world-runtime.js';
import {
  createPostwarCentralBankIntakeAuthorizationPool,
  createPostwarCentralBankAuthorizationDatabase,
} from '../persistence/postwar-central-bank-intake-authorization.js';
import {
  createPostwarNarrowTradeSharedDatabase,
  createPostwarNarrowTradeSharedRuntime,
  type PostwarNarrowTradeSharedRuntime,
} from '../preparation/postwar-narrow-trade-shared-runtime.js';
import { createPostwarNarrowTradeIntakeAuthorizationPool } from '../persistence/postwar-narrow-trade-intake-authorization.js';
import { createPostwarIndustryAuthorizationDatabase } from '../persistence/postwar-industry-current-authorization.js';
import {
  createServerCommandHostBinding,
  registeredFinanceCommandHostDependencies,
  type ServerCommandHostBinding,
} from './production-world-command-host.js';
import {
  createRegisteredWorldExecutionDatabase,
  registeredWorldExecutionClockScope,
} from '../time/registered-world-execution-state.js';
/** Fixed local/CI single-World consumer composition. Source ports and SQL
 * currentness remain mandatory; this binding is not admission or activation. */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  createPostgresFinanceBudgetNativeRuntime,
  createFinanceBudgetAuthorizationDatabase,
} from '../persistence/postgres-finance-budget-custody.js';
import { createFinanceBudgetIntakeAuthorizationPool } from '../persistence/finance-budget-intake-authorization.js';
import {
  createPostwarDayOneFxAuthorizationDatabase,
  createPostwarDayOneFxIntakeAuthorizationPool,
} from '../persistence/postgres-postwar-day-one-fx-originals.js';
import {
  createPostwarDayOneFxRuntime,
  type PostwarDayOneFxRuntime,
  type PostwarDayOneFxPreparationInput,
} from '../persistence/postwar-day-one-fx-runtime.js';
import {
  isPostgresFinanceBudgetWorldCapacitySource,
  bindPostgresFinanceBudgetCapacitySourceToSocialReplay,
  readPostgresFinanceBudgetCapacitySourceScope,
  type PostgresFinanceBudgetCapacitySource,
} from '../persistence/postgres-finance-budget-capacity-source.js';
import {
  createBoundedFinanceSocialIntakeRuntime,
  createProductionBoundedFinanceSocialIntakeRuntime,
} from '../intake/prepared-finance-budget-intake-runtime.js';
import type { ManualOfficeIntakeRuntime } from '../intake/manual-office-intake-runtime.js';
import type { ManualOfficeRuntimeReaders } from '../preparation/manual-office-command-composition.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';
import type { SqlDatabase } from '../persistence/sql-database.js';
import {
  createPostwarOfficePublicationController,
  type PostwarOfficeConsumptionStep,
  type PostwarDerivedPublicationResult,
} from '../persistence/postwar-office-publication-controller.js';
import { createPostwarCaptainMixedSource } from '../persistence/postwar-captain-mixed-source.js';
import { createPostwarCaptainRuntime } from '../persistence/postwar-captain-runtime.js';
import {
  createPostwarCaptainIntakeAuthorizationPool,
  createPostwarCaptainAuthorizationDatabase,
} from '../persistence/postwar-captain-intake-authorization.js';
import {
  createSocialIntakeAuthorizationPool,
  isPostwarSocialRuntimeConnection,
  isPreparedPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeConnectionResources,
  reservePostwarSocialRuntimeForSharedConsumer,
  releasePostwarSocialRuntimeForSharedConsumer,
  type PostwarSocialRuntimeConnection,
  type PostwarSocialSourcePreparationInput,
} from './social-runtime-connection.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
declare const sourceBinding: unique symbol;
export interface FinanceSocialSourceBinding {
  readonly [sourceBinding]: true;
}
export interface FinanceSocialSourceDependencies {
  readonly formalBinding: ServerCommandHostBinding | null;
  readonly worldId: string;
  readonly workerId: string;
  readonly database: SqlDatabase;
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly rawIntakePool: Pick<Pool, 'connect'>;
  readonly workerPool: Pool;
  readonly clock: DurableConsumptionClock;
  readonly environment: NodeJS.ProcessEnv;
  readonly sha256Hex: (input: string) => string;
  readonly readers: Readonly<ManualOfficeRuntimeReaders>;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
}
const sources = new WeakMap<
  FinanceSocialSourceBinding,
  Readonly<FinanceSocialSourceDependencies>
>();
export function readFinanceSocialSourceBinding(
  value: FinanceSocialSourceBinding,
): Readonly<FinanceSocialSourceDependencies> {
  const data = sources.get(value);
  if (!data) throw Error('GENUINE_FINANCE_SOCIAL_SOURCE_BINDING_REQUIRED');
  return data;
}
export interface PostwarFinanceSocialRuntimeConnectionInput {
  readonly industry?: {
    readonly sourceContext: PostwarPhysicalSourceContext;
    /** Separate existing Industry publisher principal; never reader enrollment. */
    readonly publicationDatabase?: SqlDatabase;
    readonly preparedRuns?: readonly Readonly<PostwarIndustryPreparedRun>[];
    /** Explicit fixed, deferred source preparation; old Industry installation does not enable utilities. */
    readonly utilityPreparation?: Omit<
      PostwarIndustryUtilitySourceInput,
      'socialConnection'
    >;
  };
  readonly industryLabour?: { readonly enabled: true };
  readonly beneficialRent?: {
    readonly workerRole: string;
    readonly clockBindingRef: string;
  };
  readonly centralBankOmo?: {
    readonly workerRole: string;
    readonly countryIds: readonly string[];
    readonly mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
  };
  readonly trade?: { readonly workerRole: string };
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly capacitySource: PostgresFinanceBudgetCapacitySource;
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly clock: DurableConsumptionClock;
  readonly environment: 'local' | 'ci';
  /** Explicit installation of the fixed source only, never another consumer. */
  readonly treasuryFx?: { readonly workerRole: string };
  /** Explicit borrowed publisher transport. This controller joins publication,
   * but the host must end its separate pool after stop completes. */
  readonly publicationDatabase?: SqlDatabase;
  /** Fixed source mode only; it never supplies capital, candidates or authority. */
  readonly captain?: {
    readonly workerRole: string;
    readonly mode: 'TEST_ONLY_LOCAL' | 'OFFICIAL_RUNTIME';
  };
}
export interface PostwarFinanceSocialRuntimePorts {
  readonly socialServiceCreation: NonNullable<
    ManualOfficeRuntimeReaders['socialServiceCreation']
  > | null;
  readonly industryUtility: Readonly<PostwarIndustryUtilityRuntime> | null;
  readonly industryLogistics: Readonly<PostwarIndustryLogisticsRuntime> | null;
  readonly industryRun: Readonly<PostwarIndustryRunRuntime> | null;
  readonly industry: Readonly<PostwarIndustryRuntime> | null;
  readonly beneficialRent: Readonly<PostwarBeneficialHousingRentRuntime> | null;
  readonly centralBankOmo: Readonly<PostwarCentralBankOmoWorldRuntime> | null;
  readonly trade: Readonly<PostwarNarrowTradeSharedRuntime> | null;
  readonly formalBinding: ServerCommandHostBinding | null;
  readonly worldId: string;
  readonly workerId: string;
  readonly database: SqlDatabase;
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly rawIntakePool: Pick<Pool, 'connect'>;
  readonly workerPool: Pool;
  readonly clock: DurableConsumptionClock;
  readonly environment: 'local' | 'ci' | 'staging' | 'production';
  readonly runtime: ManualOfficeIntakeRuntime;
  readonly budget: NonNullable<ManualOfficeRuntimeReaders['financeBudget']>;
  readonly treasuryFx: PostwarDayOneFxRuntime | null;
  readonly captain: NonNullable<
    ManualOfficeRuntimeReaders['captainNative']
  > | null;
  readonly publication: ReturnType<
    typeof createPostwarOfficePublicationController
  > | null;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly financeCountryIds: readonly string[];
}
export interface PostwarFinanceSocialRuntimeConnection {
  readonly worldId: string;
  readonly workerId: string;
  prepare(
    input: PostwarSocialSourcePreparationInput,
    fxOpening?: PostwarDayOneFxPreparationInput,
  ): Promise<void>;
  /** Complete the fixed FX source first so a host can release its large seed. */
  prepareTreasuryFx(opening: PostwarDayOneFxPreparationInput): Promise<void>;
  publishIndustryWaterGrant(
    scope: Parameters<PostwarIndustryUtilityRuntime['publishWaterGrant']>[0],
  ): ReturnType<PostwarIndustryUtilityRuntime['publishWaterGrant']>;
  publishDueIndustryWork(
    scope: Parameters<PostwarIndustryWorkRuntime['publishDueWork']>[0],
  ): ReturnType<PostwarIndustryWorkRuntime['publishDueWork']>;
  publishIndustryDueWage(
    scope: Parameters<PostwarIndustryOperatingWageRuntime['publishDue']>[0],
  ): ReturnType<PostwarIndustryOperatingWageRuntime['publishDue']>;
  startPreparation(): void;
  consumeOnce(): Promise<PostwarOfficeConsumptionStep>;
  /** Derived retry only: the fixed helper reloads the actual permanent FINAL. */
  retryDerivedPublication(
    commandId: string,
  ): Promise<PostwarDerivedPublicationResult>;
  stop(): Promise<void>;
}
const connections = new WeakMap<
  object,
  Readonly<PostwarFinanceSocialRuntimePorts>
>();
const connectionSources = new WeakMap<object, FinanceSocialSourceBinding>();
const preparedTreasuryFxConnections = new WeakSet<object>();
/** Startup state only; never authorization, admission or permission to consume. */
export function hasPreparedPostwarFinanceSocialTreasuryFx(
  value: Readonly<PostwarFinanceSocialRuntimeConnection>,
): boolean {
  return connections.has(value) && preparedTreasuryFxConnections.has(value);
}
const worldOwners = new Map<string, object>();
export function isPostwarFinanceSocialRuntimeConnection(
  value: unknown,
  world: string,
): value is Readonly<PostwarFinanceSocialRuntimeConnection> {
  return (
    value !== null &&
    typeof value === 'object' &&
    connections.get(value)?.worldId === world &&
    sources.has(connectionSources.get(value)!)
  );
}
/** Server-only fixed ports for HTTP registration/recovery. Callers may not
 * replace a reader, candidate, adapter, clock, or source with a callback. */
export function readPostwarFinanceSocialRuntimeBinding(
  value: Readonly<PostwarFinanceSocialRuntimeConnection>,
): Readonly<PostwarFinanceSocialRuntimePorts> {
  const ports = connections.get(value);
  if (!ports || !sources.has(connectionSources.get(value)!))
    throw Error('GENUINE_FINANCE_SOCIAL_RUNTIME_CONNECTION_REQUIRED');
  return ports;
}
export function createPostwarFinanceSocialRuntimeConnection(
  input: PostwarFinanceSocialRuntimeConnectionInput,
): Readonly<PostwarFinanceSocialRuntimeConnection> {
  if (!['local', 'ci'].includes(input.environment))
    throw Error('FINANCE_SOCIAL_LOCAL_CI_ONLY');
  return constructFinanceSocialRuntimeConnection(input);
}
export interface ProductionPostwarFinanceSocialRuntimeConnectionInput {
  readonly industry?: {
    readonly sourceContext: PostwarPhysicalSourceContext;
    /** Separate existing Industry publisher principal; never reader enrollment. */
    readonly publicationDatabase?: SqlDatabase;
    readonly preparedRuns?: readonly Readonly<PostwarIndustryPreparedRun>[];
    /** Explicit fixed, deferred source preparation; old Industry installation does not enable utilities. */
    readonly utilityPreparation?: Omit<
      PostwarIndustryUtilitySourceInput,
      'socialConnection'
    >;
  };
  readonly industryLabour?: { readonly enabled: true };
  readonly beneficialRent?: {
    readonly workerRole: string;
    readonly clockBindingRef: string;
  };
  readonly centralBankOmo?: {
    readonly workerRole: string;
    readonly countryIds: readonly string[];
    readonly mode: 'OFFICIAL_RUNTIME';
  };
  readonly trade?: { readonly workerRole: string };
  readonly binding: ServerCommandHostBinding;
  readonly environment: 'staging' | 'production';
  readonly publicationDatabase?: SqlDatabase;
  readonly treasuryFx?: { readonly workerRole: string };
  readonly captain?: {
    readonly workerRole: string;
    readonly mode: 'OFFICIAL_RUNTIME';
  };
}
/** Fixed formal issuer. No environment relabel, arbitrary reader or simulated
 * time callback; every request/transaction still requires current DB originals. */
export function createProductionPostwarFinanceSocialRuntimeConnection(
  input: ProductionPostwarFinanceSocialRuntimeConnectionInput,
): Readonly<PostwarFinanceSocialRuntimeConnection> {
  const d = registeredFinanceCommandHostDependencies(input.binding),
    social = d.socialRuntimeConnection,
    clock = registeredWorldExecutionClockScope(d.clock);
  if (
    !['staging', 'production'].includes(input.environment) ||
    !social ||
    !isPostwarSocialRuntimeConnection(social, d.worldId) ||
    d.workerDatabase !== social.database ||
    social.workerId !== d.workerId ||
    !clock ||
    clock.database !== social.database ||
    clock.worldId !== d.worldId ||
    clock.workerId !== d.workerId ||
    (input.captain && input.captain.mode !== 'OFFICIAL_RUNTIME') ||
    (input.centralBankOmo && input.centralBankOmo.mode !== 'OFFICIAL_RUNTIME')
  )
    throw Error('FORMAL_SHARED_EXACT_SERVER_CLOCK_DATABASE_BINDING_REQUIRED');
  return constructFinanceSocialRuntimeConnection(
    {
      socialConnection: social,
      capacitySource: d.financeCapacitySource,
      intakePool: d.intakePool,
      clock: d.clock,
      environment: input.environment,
      ...(input.publicationDatabase
        ? { publicationDatabase: input.publicationDatabase }
        : {}),
      ...(input.treasuryFx ? { treasuryFx: input.treasuryFx } : {}),
      ...(input.captain ? { captain: input.captain } : {}),
      ...(input.centralBankOmo ? { centralBankOmo: input.centralBankOmo } : {}),
      ...(input.trade ? { trade: input.trade } : {}),
      ...(input.industry ? { industry: input.industry } : {}),
      ...(input.industryLabour ? { industryLabour: input.industryLabour } : {}),
      ...(input.beneficialRent ? { beneficialRent: input.beneficialRent } : {}),
    },
    input.binding,
  );
}
function constructFinanceSocialRuntimeConnection(
  input: Omit<PostwarFinanceSocialRuntimeConnectionInput, 'environment'> & {
    readonly environment: 'local' | 'ci' | 'staging' | 'production';
  },
  serverBinding: ServerCommandHostBinding | null = null,
): Readonly<PostwarFinanceSocialRuntimeConnection> {
  // Retain the large startup seed only until the one deferred preparation
  // finishes. The long-lived transport/consumer closure keeps no seed carrier.
  let deferredUtilityPreparation = input.industry?.utilityPreparation;
  if (input.industry) {
    const retainedIndustry = { ...input.industry };
    delete retainedIndustry.utilityPreparation;
    input = { ...input, industry: retainedIndustry };
  }
  const social = input.socialConnection,
    world = social?.worldId;
  if (!isPostwarSocialRuntimeConnection(social, world))
    throw Error('GENUINE_SOCIAL_RUNTIME_CONNECTION_REQUIRED');
  if (!isPostgresFinanceBudgetWorldCapacitySource(input.capacitySource, world))
    throw Error('GENUINE_FINITE_WORLD_FINANCE_CAPACITY_SOURCE_REQUIRED');
  if (
    !Object.isFrozen(input.clock) ||
    typeof Object.getOwnPropertyDescriptor(input.clock, 'nowReal')?.value !==
      'function' ||
    typeof Object.getOwnPropertyDescriptor(input.clock, 'simTime')?.value !==
      'function'
  )
    throw Error('FINANCE_SOCIAL_IMMUTABLE_SERVER_CLOCK_REQUIRED');
  const resources = readPostwarSocialRuntimeConnectionResources(social),
    scope = readPostgresFinanceBudgetCapacitySourceScope(input.capacitySource);
  if (
    scope.historyMode !== 'BUDGET_SOCIAL' ||
    scope.countryIds.some((c) => !resources.countryIds.includes(c))
  )
    throw Error('FINANCE_SOCIAL_EXACT_COUNTRY_SCOPE_REQUIRED');
  if (
    input.centralBankOmo &&
    (input.centralBankOmo.workerRole !== resources.workerRole ||
      !['OFFICIAL_RUNTIME', 'TEST_ONLY_LOCAL'].includes(
        input.centralBankOmo.mode,
      ) ||
      input.centralBankOmo.countryIds.length === 0 ||
      new Set(input.centralBankOmo.countryIds).size !==
        input.centralBankOmo.countryIds.length ||
      input.centralBankOmo.countryIds.some(
        (c) => !resources.countryIds.includes(c),
      ))
  )
    throw Error('SHARED_CB_EXACT_FINITE_COUNTRY_ROLE_REQUIRED');
  if (
    input.beneficialRent &&
    input.beneficialRent.workerRole !== resources.workerRole
  )
    throw Error('SHARED_RENT_EXACT_WORKER_ROLE_REQUIRED');
  if (input.trade && input.trade.workerRole !== resources.workerRole)
    throw Error('SHARED_TRADE_EXACT_WORKER_ROLE_REQUIRED');
  if (
    typeof input.intakePool?.connect !== 'function' ||
    input.intakePool === resources.workerPool
  )
    throw Error('FINANCE_SOCIAL_SEPARATE_INTAKE_REQUIRED');
  if (
    input.captain &&
    !['TEST_ONLY_LOCAL', 'OFFICIAL_RUNTIME'].includes(input.captain.mode)
  )
    throw Error('FINANCE_SOCIAL_CAPTAIN_EXPLICIT_SOURCE_MODE_REQUIRED');
  if (
    input.captain &&
    (input.captain.workerRole !== resources.workerRole ||
      (input.treasuryFx &&
        input.captain.workerRole !== input.treasuryFx.workerRole))
  )
    throw Error('FINANCE_SOCIAL_CAPTAIN_EXACT_WORKER_ROLE_REQUIRED');
  if (
    input.industryLabour &&
    (input.industryLabour.enabled !== true || !input.publicationDatabase)
  )
    throw Error('INDUSTRY_LABOUR_EXPLICIT_DERIVED_PUBLISHER_REQUIRED');
  if (
    input.industry &&
    (!input.publicationDatabase ||
      input.publicationDatabase === social.database)
  )
    throw Error('INDUSTRY_SEPARATE_PUBLICATION_DATABASE_REQUIRED');
  if (worldOwners.has(world))
    throw Error('FINANCE_SOCIAL_WORLD_CONSUMER_ALREADY_BOUND');
  const reservation = Object.freeze({});
  worldOwners.set(world, reservation);
  const token = Object.freeze({}) as FinanceSocialSourceBinding;
  let reserved = false;
  try {
    // Office-specific authority helpers must intercept their exact capability
    // before Social's general dual-capability adapter. Keep the same-backend
    // manual scope outside those adapters so reauthorization retains this tx.
    const d = serverBinding
      ? registeredFinanceCommandHostDependencies(serverBinding)
      : null;
    const executionDatabase = d
      ? createRegisteredWorldExecutionDatabase(social.database, input.clock, {
          seedId: d.seedRef,
          seedFingerprint: d.contentHash,
          admissionRef: d.admissionRef,
          modelVersion: d.modelVersion,
        })
      : social.database;
    const fxDatabase = input.treasuryFx
      ? createPostwarDayOneFxAuthorizationDatabase(executionDatabase)
      : executionDatabase;
    const financeDatabase =
      createFinanceBudgetAuthorizationDatabase(fxDatabase);
    const captainDatabase = input.captain
      ? createPostwarCaptainAuthorizationDatabase(financeDatabase)
      : financeDatabase;
    const centralBankDatabase = input.centralBankOmo
      ? createPostwarCentralBankAuthorizationDatabase(captainDatabase)
      : captainDatabase;
    const industryDatabase = input.industry
      ? createPostwarIndustryAuthorizationDatabase(centralBankDatabase)
      : centralBankDatabase;
    const officeDatabase =
      createManualOfficeAuthorizationTransactionDatabase(industryDatabase);
    const database = input.trade
      ? createPostwarNarrowTradeSharedDatabase(officeDatabase, world)
      : officeDatabase;
    const socialIntake = createSocialIntakeAuthorizationPool(input.intakePool);
    const financeIntake = createFinanceBudgetIntakeAuthorizationPool(
      input.treasuryFx
        ? createPostwarDayOneFxIntakeAuthorizationPool(socialIntake)
        : socialIntake,
    );
    const captainIntake = input.captain
      ? createPostwarCaptainIntakeAuthorizationPool(financeIntake)
      : financeIntake;
    const centralBankIntake = input.centralBankOmo
      ? createPostwarCentralBankIntakeAuthorizationPool(captainIntake)
      : captainIntake;
    const tradeIntake = input.trade
      ? createPostwarNarrowTradeIntakeAuthorizationPool(centralBankIntake)
      : centralBankIntake;
    const intakePool = input.industry
      ? createPostwarIndustryIntakeAuthorizationPool(tradeIntake)
      : tradeIntake;
    const treasuryFx = input.treasuryFx
      ? createPostwarDayOneFxRuntime({
          database,
          worldId: world,
          workerId: social.workerId,
          workerRole: input.treasuryFx.workerRole,
          mixedSocialConnection: social,
        })
      : null;
    const budget = createPostgresFinanceBudgetNativeRuntime({
      database,
      workerId: social.workerId,
      sha256Hex: sha,
      capacitySource: bindPostgresFinanceBudgetCapacitySourceToSocialReplay(
        input.capacitySource,
        social,
      ),
    });
    const captain = input.captain
      ? createPostwarCaptainRuntime({
          database,
          workerId: social.workerId,
          workerRole: input.captain.workerRole,
          mode: input.captain.mode,
          mixedSource: createPostwarCaptainMixedSource({
            worldId: world,
            social,
          }),
        })
      : null;
    const centralBankOmo = input.centralBankOmo
      ? createPostwarCentralBankOmoWorldRuntime({
          database,
          worldId: world,
          workerId: social.workerId,
          workerRole: input.centralBankOmo.workerRole,
          mode: input.centralBankOmo.mode,
          countryIds: Object.freeze([...input.centralBankOmo.countryIds]),
          mixedSocialConnection: social,
          clock: input.clock,
          workerPool: resources.workerPool,
        })
      : null;
    const trade = input.trade
      ? createPostwarNarrowTradeSharedRuntime({
          environment: input.environment,
          database,
          socialConnection: social,
          clock: input.clock,
          workerRole: input.trade.workerRole,
        })
      : null;
    const industrySource = input.industry
      ? createPostwarMixedCurrentProjectionSource({
          historyMode: 'PAGED_COMPLETE_V1',
          socialConnection: social,
          worldId: world,
          workerRole: resources.workerRole,
          publicationDatabase: input.publicationDatabase!,
        })
      : null;
    const industry =
      input.industry && industrySource
        ? createPostwarIndustryRuntime({
            worldId: world,
            database,
            socialConnection: social,
            mixedSource: industrySource,
            sourceContext: input.industry.sourceContext,
            ...(input.industry.preparedRuns
              ? { preparedRuns: input.industry.preparedRuns }
              : {}),
          })
        : null;
    const industryWork = input.industry
      ? createPostwarIndustryWorkRuntime({
          database,
          socialConnection: social,
          ...(input.industry.publicationDatabase
            ? {
                publication: {
                  database: input.industry.publicationDatabase,
                  clock: Object.freeze({
                    nowReal: () => input.clock.nowReal(),
                    simTime: () => input.clock.simTime(world),
                  }),
                },
              }
            : {}),
        })
      : null;
    const industryRun = input.industry
      ? createPostwarIndustryRunRuntime({ database, socialConnection: social })
      : null;
    const industryUtility =
      deferredUtilityPreparation && input.industry
        ? createPostwarIndustryUtilityRuntime({
            database,
            socialConnection: social,
            ...(input.industry.publicationDatabase
              ? {
                  publication: {
                    database: input.industry.publicationDatabase,
                    clock: Object.freeze({
                      nowReal: () => input.clock.nowReal(),
                      simTime: () => input.clock.simTime(world),
                    }),
                  },
                }
              : {}),
          })
        : null;
    const industryLogistics =
      deferredUtilityPreparation && input.industry
        ? createPostwarIndustryLogisticsRuntime({
            database,
            socialConnection: social,
            clock: input.clock,
            sourceContext: input.industry.sourceContext,
          })
        : null;
    let readers: Readonly<ManualOfficeRuntimeReaders> = Object.freeze({
      ...social.readers,
      ...(d
        ? {
            socialServiceCreation:
              createPostwarSocialServiceCreationForSharedConnection(social, {
                database,
                clock: input.clock,
              }),
          }
        : {}),
      financeBudget: budget,
      ...(industry ? { industry } : {}),
      ...(industryRun ? { industryRun } : {}),
      ...(industryUtility ? { industryUtility } : {}),
      ...(industryLogistics ? { industryLogistics } : {}),
      ...(industryWork ? { industryWork } : {}),
      ...(treasuryFx ? { treasuryFx } : {}),
      ...(captain ? { captainNative: captain } : {}),
      ...(centralBankOmo ? { centralBankNative: centralBankOmo } : {}),
      ...(trade
        ? {
            tradeReservation: trade.reservation,
            tradeAutomatic: trade.automatic,
            tradeSource: trade.source,
          }
        : {}),
    });
    sources.set(
      token,
      Object.freeze({
        worldId: world,
        formalBinding: null,
        workerId: social.workerId,
        database,
        intakePool,
        rawIntakePool: input.intakePool,
        workerPool: resources.workerPool,
        clock: input.clock,
        environment: Object.freeze({ ECONMIND_ENV: input.environment }),
        sha256Hex: sha,
        readers,
        socialConnection: social,
      }),
    );
    const industryOperatingWage = input.industry
      ? createPostwarIndustryOperatingWageRuntime({
          sharedBinding: token,
          ...(input.industry?.publicationDatabase
            ? { publicationDatabase: input.industry.publicationDatabase }
            : {}),
        })
      : null;
    if (industryOperatingWage) {
      readers = Object.freeze({ ...readers, industryOperatingWage });
      sources.set(
        token,
        Object.freeze({ ...readFinanceSocialSourceBinding(token), readers }),
      );
    }
    const beneficialRent = input.beneficialRent
      ? createPostwarBeneficialHousingRentRuntimeForSharedSource({
          sharedBinding: token,
          clockBindingRef: input.beneficialRent.clockBindingRef,
        })
      : null;
    if (beneficialRent) {
      readers = Object.freeze({
        ...readers,
        beneficialHousingRent: beneficialRent,
      });
      sources.set(
        token,
        Object.freeze({ ...readFinanceSocialSourceBinding(token), readers }),
      );
    }
    const formalBinding = d
      ? createServerCommandHostBinding({
          ...d,
          workerDatabase: database,
          intakePool,
          readers,
          financeCapacitySource:
            bindPostgresFinanceBudgetCapacitySourceToSocialReplay(
              input.capacitySource,
              social,
            ),
          socialRuntimeConnection: social,
          sharedSourceBinding: token,
        })
      : null;
    if (formalBinding)
      sources.set(
        token,
        Object.freeze({
          ...readFinanceSocialSourceBinding(token),
          formalBinding,
        }),
      );
    const rentPreparation = beneficialRent
      ? createPostwarBeneficialRentPreparationController({
          sharedBinding: token,
          runtime: beneficialRent,
        })
      : null;
    reservePostwarSocialRuntimeForSharedConsumer(social, token);
    reserved = true;
    const issued = formalBinding
        ? createProductionBoundedFinanceSocialIntakeRuntime(token)
        : createBoundedFinanceSocialIntakeRuntime(token),
      runtime = issued.runtime;
    const publication = input.publicationDatabase
      ? createPostwarOfficePublicationController({
          worldId: world,
          database,
          workerRole: resources.workerRole,
          socialConnection: social,
          publicationDatabase: input.publicationDatabase,
          ...(input.industryLabour ? { industryLabour: true as const } : {}),
          ...(input.trade ? { tradeCurrent: true as const } : {}),
        })
      : null;
    let combinedActive: Promise<PostwarOfficeConsumptionStep> | null = null;
    let retryActive: Promise<PostwarDerivedPublicationResult> | null = null;
    let stopped = false,
      stopping: Promise<void> | null = null;
    let fxPrepared = false;
    let utilityPreparing: Promise<void> | null = null;
    let utilityPrepared =
      industryUtility === null && industryLogistics === null;
    const prepareUtilities = async () => {
      if (utilityPreparing) return utilityPreparing;
      const config = deferredUtilityPreparation;
      if (!config || !industryUtility || !industryLogistics) return;
      requireLive();
      utilityPreparing = (async () => {
        try {
          // An explicit server-only site remains exact; default host assembly
          // prepares only the approved/actually-registered 21-site intersection.
          const prepared = config.site
            ? [
                await preparePostwarIndustryUtilitySource({
                  ...config,
                  socialConnection: social,
                }),
              ]
            : await preparePostwarIndustryUtilitySources({
                ...config,
                socialConnection: social,
              });
          try {
            for (const source of prepared) {
              requireLive();
              await industryUtility.prepare(source);
            }
          } catch (error) {
            for (const source of prepared)
              retireUnownedPostwarIndustryUtilitySource(source);
            throw error;
          }
          requireLive();
          await industryLogistics.prepare(config);
          requireLive();
          utilityPrepared = true;
        } finally {
          deferredUtilityPreparation = undefined;
        }
      })();
      await utilityPreparing;
    };
    let fxPreparing: Promise<void> | null = null;
    let fxPreparationPin: string | null = null;
    let fxSourcePreparation: PreparedBeneficialHousingRentSource | undefined;
    const requireLive = () => {
      if (stopped || stopping || !sources.has(token))
        throw Error('FINANCE_SOCIAL_RUNTIME_RETIRED');
    };
    const requirePrepared = () => {
      requireLive();
      if (
        !isPreparedPostwarSocialRuntimeConnection(social, world) ||
        (treasuryFx !== null && !fxPrepared) ||
        !utilityPrepared
      )
        throw Error('FINANCE_SOCIAL_SOURCE_NOT_PREPARED');
      rentPreparation?.assertPrepared();
    };
    const prepareTreasuryFx = async (
      opening: PostwarDayOneFxPreparationInput,
    ): Promise<void> => {
      requireLive();
      if (!treasuryFx) throw Error('FINANCE_SOCIAL_FX_SOURCE_NOT_INSTALLED');
      const pin = sha(
        JSON.stringify({
          world: opening.seed.worldId,
          seed: opening.seed.fingerprint,
          policy: sha(opening.policyBytes),
          adoption: sha(opening.userReceiptBytes),
        }),
      );
      if (fxPreparationPin !== null && fxPreparationPin !== pin)
        throw Error('FINANCE_SOCIAL_FX_PREPARATION_PINS_CHANGED');
      if (
        fxPreparing &&
        fxSourcePreparation !== opening.startupBeneficialHousingRentSource
      )
        throw Error('FINANCE_SOCIAL_FX_PREPARATION_PROOF_CHANGED');
      fxSourcePreparation = opening.startupBeneficialHousingRentSource;
      fxPreparationPin = pin;
      fxPreparing ??= treasuryFx.prepare(opening).then(() => {
        fxPrepared = true;
      });
      await fxPreparing;
      requireLive();
      preparedTreasuryFxConnections.add(connection);
    };
    const connection: Readonly<PostwarFinanceSocialRuntimeConnection> =
      Object.freeze({
        worldId: world,
        workerId: social.workerId,
        async prepare(
          configuration: PostwarSocialSourcePreparationInput,
          fxOpening?: PostwarDayOneFxPreparationInput,
        ) {
          requireLive();
          if (
            (!treasuryFx && fxOpening) ||
            (treasuryFx && !fxPrepared && !fxOpening)
          )
            throw Error('FINANCE_SOCIAL_FX_EXACT_PREPARATION_REQUIRED');
          if (fxOpening) await prepareTreasuryFx(fxOpening);
          // Hosts controlling peak memory can call prepareTreasuryFx first,
          // release their raw seed, then call prepare without an FX argument.
          if (rentPreparation)
            await rentPreparation.prepare(configuration, fxSourcePreparation);
          else {
            if (
              configuration.startupBeneficialHousingRentSource ||
              fxSourcePreparation
            )
              throw Error('FINANCE_SOCIAL_CHILD_PROOF_REQUIRES_RENT_OWNER');
            await social.prepare(configuration);
          }
          requireLive();
          if (centralBankOmo) await centralBankOmo.prepareFromSocial();
          requireLive();
          if (industry) await industry.prepare();
          await prepareUtilities();
          requireLive();
        },
        prepareTreasuryFx,
        publishIndustryWaterGrant(
          scope: Parameters<
            PostwarIndustryUtilityRuntime['publishWaterGrant']
          >[0],
        ) {
          requirePrepared();
          if (!industryUtility)
            throw Error('INDUSTRY_UTILITY_RUNTIME_NOT_INSTALLED');
          return industryUtility.publishWaterGrant(scope);
        },
        publishDueIndustryWork(
          scope: Parameters<PostwarIndustryWorkRuntime['publishDueWork']>[0],
        ) {
          requirePrepared();
          if (!industryWork) throw Error('INDUSTRY_WORK_RUNTIME_NOT_INSTALLED');
          return industryWork.publishDueWork(scope);
        },
        publishIndustryDueWage(
          scope: Parameters<
            PostwarIndustryOperatingWageRuntime['publishDue']
          >[0],
        ) {
          requirePrepared();
          if (!industryOperatingWage)
            throw Error('INDUSTRY_WAGE_RUNTIME_NOT_INSTALLED');
          return industryOperatingWage.publishDue(scope);
        },
        startPreparation() {
          requirePrepared();
          runtime.consumer.startPreparation();
        },
        consumeOnce() {
          requirePrepared();
          if (!publication) return runtime.consumer.consumeOnce();
          if (combinedActive || retryActive)
            return Promise.resolve(
              Object.freeze({
                status: 'BLOCKED' as const,
                reason: 'STEP_ALREADY_RUNNING',
                commandId: null,
              }),
            );
          const work = Promise.resolve()
            .then(() => runtime.consumer.consumeOnce())
            .then((step) => publication.afterCommitted(step));
          combinedActive = work;
          void work.then(
            () => {
              if (combinedActive === work) combinedActive = null;
            },
            () => {
              if (combinedActive === work) combinedActive = null;
            },
          );
          return work;
        },
        retryDerivedPublication(commandId: string) {
          requirePrepared();
          if (!publication)
            throw Error('FINANCE_SOCIAL_PUBLICATION_NOT_INSTALLED');
          if (combinedActive || retryActive)
            return Promise.resolve(
              Object.freeze({
                status: 'UNAVAILABLE' as const,
                commandId,
                reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY' as const,
              }),
            );
          const work = Promise.resolve().then(() =>
            publication.retryCommitted(commandId),
          );
          retryActive = work;
          void work.then(
            () => {
              if (retryActive === work) retryActive = null;
            },
            () => {
              if (retryActive === work) retryActive = null;
            },
          );
          return work;
        },
        stop() {
          if (stopping) return stopping;
          stopped = true;
          deferredUtilityPreparation = undefined;
          preparedTreasuryFxConnections.delete(connection);
          stopping = (async () => {
            if (combinedActive || retryActive)
              await Promise.allSettled([combinedActive, retryActive]);
            await runtime.consumer.stop();
            await publication?.close();
            if (fxPreparing) await Promise.allSettled([fxPreparing]);
            await treasuryFx?.close();
            await centralBankOmo?.close();
            if (utilityPreparing) await Promise.allSettled([utilityPreparing]);
            await industryLogistics?.close();
            await industryUtility?.close();
            await industryOperatingWage?.close();
            await industryWork?.close();
            await industryRun?.close();
            await industry?.close();
            await industrySource?.close();
            await rentPreparation?.close();
            fxSourcePreparation = undefined;
            releasePostwarSocialRuntimeForSharedConsumer(social, token);
            sources.delete(token);
            await social.close();
            connections.delete(connection);
            connectionSources.delete(connection);
            if (worldOwners.get(world) === connection)
              worldOwners.delete(world);
          })();
          return stopping;
        },
      });
    connections.set(
      connection,
      Object.freeze({
        worldId: world,
        workerId: social.workerId,
        database,
        intakePool,
        rawIntakePool: input.intakePool,
        workerPool: resources.workerPool,
        clock: input.clock,
        environment: input.environment,
        formalBinding,
        runtime,
        budget: issued.budget,
        centralBankOmo,
        industry,
        industryRun,
        industryUtility,
        socialServiceCreation: readers.socialServiceCreation ?? null,
        industryLogistics,
        beneficialRent,
        trade,
        treasuryFx,
        captain,
        publication,
        socialConnection: social,
        financeCountryIds: scope.countryIds,
      }),
    );
    requirePostwarSocialSourceRevocationFence(social.database, world);
    requirePostwarSocialRuntimePagedReplay(social, world);
    connectionSources.set(connection, token);
    worldOwners.set(world, connection);
    return connection;
  } catch (error) {
    if (reserved) releasePostwarSocialRuntimeForSharedConsumer(social, token);
    sources.delete(token);
    if (worldOwners.get(world) === reservation) worldOwners.delete(world);
    throw error;
  }
}
