import {
  readFinanceSocialSourceBinding,
  type FinanceSocialSourceBinding,
} from '../runtime-preparation/finance-social-runtime-connection.js';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  FINANCE_BUDGET_APPROPRIATION_COMMAND,
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
} from '@econmind/core/authenticated-office-command-contract';
import { isPostwarDayOneFxRuntime } from '../persistence/postwar-day-one-fx-runtime.js';
import {
  readPostwarTreasuryFxSourceBinding,
  type PostwarTreasuryFxSourceBinding,
} from '../runtime-preparation/postwar-treasury-fx-runtime-connection.js';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  type CanonicalCommand,
  type Sha256Hex,
} from '@econmind/core';
import { PostgresTransactionError } from '../persistence/postgres-sql-database.js';
import type { SqlDatabase } from '../persistence/sql-database.js';
import { isFinanceBudgetNativeCommitGuard } from '../persistence/postgres-finance-budget-custody.js';
import { isPostwarSocialPositionSourceCommitProtectionPort } from '../persistence/postwar-social-position-runtime.js';
import {
  boundProductionManualIntakeRuntime,
  isProductionManualIntakeRuntime,
  trackWorkerRequestCompletion,
  type ProductionManualIntakeRuntime,
  type ServerCommandHostBinding,
  registeredFinanceCommandHostDependencies,
  productionFinanceCommandExecutionBlocker,
  createProductionWorldCommandHost,
  preflightProductionManualIntakeRuntime,
  WorkerRequestCompletion,
} from '../runtime-preparation/production-world-command-host.js';
import {
  createDurableCommandConsumptionPreparation,
  createTreasuryFxCommandConsumptionPreparation,
  createFinanceSocialCommandConsumptionPreparation,
  createProductionFinanceCommandConsumption,
  type DurableConsumptionClock,
} from '../preparation/durable-command-consumption.js';
import {
  createManualOfficeCommandComposition,
  isManualOfficeSourceMissing,
  type ManualOfficeRuntimeReaders,
} from '../preparation/manual-office-command-composition.js';

/** SOURCE_ONLY server composition. This real consumer remains PREPARED; no
 * host loop/HTTP route, production registration, grant or activation is issued. */
export interface ManualOfficeIntakeRuntime {
  readonly consumer: ReturnType<
    typeof createDurableCommandConsumptionPreparation
  >;
}
type Construction = {
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly workerDatabase: SqlDatabase;
  readonly worldId: string;
  readonly workerId: string;
  readonly clock: DurableConsumptionClock;
  readonly sha256Hex: Sha256Hex;
  readonly environment: NodeJS.ProcessEnv;
  readonly readers: ManualOfficeRuntimeReaders;
  readonly treasuryFxBinding?: PostwarTreasuryFxSourceBinding;
  readonly productionBinding?: ServerCommandHostBinding;
  readonly productionHost?: ReturnType<typeof createProductionWorldCommandHost>;
};
const constructions = new WeakMap<ManualOfficeIntakeRuntime, Construction>();

/** Fixed existing source/factory and sole consumer constructors only. No
 * caller candidate, readiness predicate, boolean READY or executable callback. */
export function createManualOfficeIntakeRuntime(
  input: Construction,
): ManualOfficeIntakeRuntime {
  return constructManualOfficeIntakeRuntime(input);
}
export function createTreasuryFxManualOfficeIntakeRuntime(
  binding: PostwarTreasuryFxSourceBinding,
): ManualOfficeIntakeRuntime {
  const fixed = readPostwarTreasuryFxSourceBinding(binding);
  return constructManualOfficeIntakeRuntime(
    { ...fixed, workerDatabase: fixed.workerDatabase },
    undefined,
    binding,
  );
}
/** Fixed paired source issuer only; no public consumer mode/reader callback. */
export function createFinanceSocialManualOfficeIntakeRuntime(
  binding: FinanceSocialSourceBinding,
): ManualOfficeIntakeRuntime {
  const fixed = readFinanceSocialSourceBinding(binding);
  return constructManualOfficeIntakeRuntime(
    { ...fixed, workerDatabase: fixed.database },
    binding,
  );
}
function constructManualOfficeIntakeRuntime(
  input: Construction,
  financeSocialBinding?: FinanceSocialSourceBinding,
  treasuryFxBinding: PostwarTreasuryFxSourceBinding | null = null,
): ManualOfficeIntakeRuntime {
  const head = async () => {
    const r = await input.workerDatabase.query<{
      world_version: string;
      event_sequence: string;
    }>(
      'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
      [input.worldId],
    );
    if (r.rows.length !== 1 || !r.rows[0])
      throw new DomainError(
        DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
        'Manual source requires actual World head',
      );
    return r.rows[0];
  };
  const captain = input.readers.captain,
    centralBank = input.readers.centralBank;
  const guardedCaptainRead = async (
    read: () => ReturnType<
      NonNullable<ManualOfficeRuntimeReaders['captain']>['read']
    >,
  ) => {
    const before = await head();
    const result = await read();
    if (result.kind === 'READ') {
      const after = await head();
      if (
        result.snapshot.worldVersion !== before.world_version ||
        result.snapshot.lastEventSequence !== before.event_sequence ||
        after.world_version !== before.world_version ||
        after.event_sequence !== before.event_sequence
      )
        throw new DomainError(
          DOMAIN_ERROR_CODES.VERSION_MISMATCH,
          'Captain source must bind actual stable head/sequence',
        );
    }
    return result;
  };
  const readers: ManualOfficeRuntimeReaders = {
    ...input.readers,
    ...(captain
      ? {
          captain: {
            async read(request) {
              return guardedCaptainRead(() => captain.read(request));
            },
            ...(captain.readCanonical === undefined
              ? {}
              : {
                  readCanonical: (
                    request: Parameters<
                      NonNullable<ManualOfficeRuntimeReaders['captain']>['read']
                    >[0],
                    command: CanonicalCommand,
                  ) =>
                    guardedCaptainRead(() =>
                      captain.readCanonical!(request, command),
                    ),
                }),
          },
        }
      : {}),
    ...(centralBank
      ? {
          centralBank: {
            async read(request) {
              const before = await head();
              const read = await centralBank.read(request);
              const after = await head();
              if (
                read.source.facts.worldVersion !== before.world_version ||
                read.source.facts.currentEventSequence !==
                  before.event_sequence ||
                after.world_version !== before.world_version ||
                after.event_sequence !== before.event_sequence
              )
                throw new DomainError(
                  DOMAIN_ERROR_CODES.VERSION_MISMATCH,
                  'CB source must bind actual stable head/sequence',
                );
              return read;
            },
          },
        }
      : {}),
  };
  const construction = Object.freeze({
    ...input,
    readers: Object.freeze(readers),
    ...(treasuryFxBinding ? { treasuryFxBinding } : {}),
  });
  const consumer = treasuryFxBinding
    ? createTreasuryFxCommandConsumptionPreparation(treasuryFxBinding)
    : financeSocialBinding
      ? createFinanceSocialCommandConsumptionPreparation(financeSocialBinding)
      : createDurableCommandConsumptionPreparation({
          database: construction.workerDatabase,
          workerId: construction.workerId,
          worldId: construction.worldId,
          clock: construction.clock,
          sha256Hex: construction.sha256Hex,
          environment: construction.environment,
          officeReaders: construction.readers,
        });
  const runtime = Object.freeze({ consumer });
  constructions.set(runtime, construction);
  return runtime;
}
const formalWorldOwners = new Map<string, object>();
/** Fixed server binding only; the process-local reservation is not a global
 * activation/Clock permit. Formal source/control absence still rejects intake. */
export interface RegisteredFinanceManualOfficeRuntimeComposition {
  readonly runtime: ManualOfficeIntakeRuntime;
  readonly budget: NonNullable<ManualOfficeRuntimeReaders['financeBudget']>;
  diagnostics(): Readonly<{
    status: 'REGISTERED_FINITE_FINANCE_NOT_ACTIVATION';
    blocker: string | null;
    worldId: string;
    commandExecutionEnabled: false;
  }>;
}
export function createRegisteredFinanceManualOfficeIntakeRuntime(
  binding: ServerCommandHostBinding,
): RegisteredFinanceManualOfficeRuntimeComposition {
  const d = registeredFinanceCommandHostDependencies(binding);
  if (formalWorldOwners.has(d.worldId))
    throw Error('SERVER_WORLD_FINITE_CONSUMER_ALREADY_BOUND');
  const host = createProductionWorldCommandHost(binding),
    engine = createProductionFinanceCommandConsumption(binding);
  const consumer = Object.freeze({
    ...engine,
    async stop() {
      await host.stop();
      await engine.stop();
      if (formalWorldOwners.get(d.worldId) === runtime)
        formalWorldOwners.delete(d.worldId);
    },
  });
  const runtime: ManualOfficeIntakeRuntime = Object.freeze({ consumer });
  constructions.set(
    runtime,
    Object.freeze({
      intakePool: d.intakePool,
      workerDatabase: d.workerDatabase,
      worldId: d.worldId,
      workerId: d.workerId,
      clock: d.clock,
      sha256Hex: (bytes) => createHash('sha256').update(bytes).digest('hex'),
      environment: Object.freeze({}),
      readers: Object.freeze({ financeBudget: d.readers.financeBudget! }),
      productionBinding: binding,
      productionHost: host,
    }),
  );
  formalWorldOwners.set(d.worldId, runtime);
  return Object.freeze({
    runtime,
    budget: d.readers.financeBudget!,
    diagnostics: () =>
      Object.freeze({
        status: 'REGISTERED_FINITE_FINANCE_NOT_ACTIVATION' as const,
        blocker: productionFinanceCommandExecutionBlocker(binding),
        worldId: d.worldId,
        commandExecutionEnabled: false as const,
      }),
  });
}
export function boundManualOfficeIntakeRuntime(
  runtime:
    | ManualOfficeIntakeRuntime
    | ProductionManualIntakeRuntime
    | null
    | undefined,
  input: {
    pool: Pick<Pool, 'connect'>;
    clock: DurableConsumptionClock;
    worldId: string;
  },
): runtime is ManualOfficeIntakeRuntime | ProductionManualIntakeRuntime {
  if (!runtime) return false;
  if (isProductionManualIntakeRuntime(runtime))
    return boundProductionManualIntakeRuntime(runtime, input);
  const localRuntime = runtime as ManualOfficeIntakeRuntime;
  const construction = constructions.get(localRuntime);
  return (
    !!construction &&
    construction.intakePool === input.pool &&
    construction.clock === input.clock &&
    construction.worldId === input.worldId &&
    ['PREPARED', 'READY'].includes(localRuntime.consumer.state())
  );
}
export async function preflightManualOfficeIntakeRuntime(
  runtime: ManualOfficeIntakeRuntime | ProductionManualIntakeRuntime,
  command: CanonicalCommand,
  observedAtReal: string,
): Promise<boolean> {
  if (!manualOfficeIntakeRuntimeSupportsFamily(runtime, command.commandType))
    return false;
  // 3A installs no formal source constructor and cannot pass this branch.
  if (isProductionManualIntakeRuntime(runtime)) return false;
  const localRuntime = runtime as ManualOfficeIntakeRuntime;
  const construction = constructions.get(localRuntime);
  if (
    !construction ||
    construction.worldId !== command.worldId ||
    !['PREPARED', 'READY'].includes(localRuntime.consumer.state())
  )
    return false;
  if (construction.productionBinding) {
    if (
      productionFinanceCommandExecutionBlocker(
        construction.productionBinding,
      ) !== null ||
      !construction.productionHost
    )
      return false;
    const controller = new AbortController(),
      request = construction.productionHost.openIntakeRequest({
        route: '/v1/office-command',
        signal: controller.signal,
      });
    if (!request) return false;
    const completion = new WorkerRequestCompletion();
    let outcome: { ok: true; result: boolean } | { ok: false; error: unknown };
    try {
      outcome = {
        ok: true,
        result: await completion.run(() =>
          preflightProductionManualIntakeRuntime(
            request,
            command,
            observedAtReal,
          ),
        ),
      };
    } catch (error) {
      outcome = { ok: false, error };
    } finally {
      await completion.drain();
      construction.productionHost.retireIntakeRequest(request);
      completion.retire();
    }
    if (completion.cleanupFailed())
      throw Error('FORMAL_FINANCE_PREFLIGHT_CLEANUP_UNCONFIRMED');
    if (!outcome.ok) throw outcome.error;
    return outcome.result;
  }
  const composition = createManualOfficeCommandComposition({
    command,
    database: construction.workerDatabase,
    workerId: construction.workerId,
    sha256Hex: construction.sha256Hex,
    readers: construction.readers,
  });
  if (!composition) return false;
  try {
    await trackWorkerRequestCompletion(
      composition.assertSourceBeforeClaim(observedAtReal),
    );
    return ['PREPARED', 'READY'].includes(localRuntime.consumer.state());
  } catch (error) {
    // Only a confirmed database rollback can expose its semantic source
    // denial. An unknown COMMIT outcome or cleanup failure stays operational.
    const semantic =
      error instanceof PostgresTransactionError &&
      error.outcome === 'ROLLED_BACK'
        ? error.cause
        : error;
    if (
      isManualOfficeSourceMissing(error) ||
      (error instanceof PostgresTransactionError &&
        error.outcome === 'ROLLED_BACK' &&
        isManualOfficeSourceMissing(error.cause)) ||
      (semantic instanceof DomainError &&
        (semantic.code === DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID ||
          semantic.code === DOMAIN_ERROR_CODES.OPENING_SEED_INVALID))
    )
      return false;
    throw error;
  }
}

/** Constructor identity and the actual family port are both required. An
 * unrelated runtime cannot enable Finance, including an existing-ID retry. */
export function manualOfficeIntakeRuntimeSupportsFamily(
  runtime:
    | ManualOfficeIntakeRuntime
    | ProductionManualIntakeRuntime
    | null
    | undefined,
  commandType: string,
): boolean {
  if (!runtime) return false;
  const construction = constructions.get(runtime as ManualOfficeIntakeRuntime);
  if (construction?.treasuryFxBinding) {
    readPostwarTreasuryFxSourceBinding(construction.treasuryFxBinding);
    return (
      commandType === POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND &&
      isPostwarDayOneFxRuntime(construction.readers.treasuryFx)
    );
  }
  if (commandType === POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND)
    return (
      !!construction &&
      !construction.productionBinding &&
      isPostwarDayOneFxRuntime(construction.readers.treasuryFx)
    );
  if (construction?.productionBinding)
    return (
      commandType === FINANCE_BUDGET_APPROPRIATION_COMMAND &&
      productionFinanceCommandExecutionBlocker(
        construction.productionBinding,
      ) === null &&
      isFinanceBudgetNativeCommitGuard(
        construction.readers.financeBudget?.commitGuard,
      )
    );
  if (
    commandType !== FINANCE_BUDGET_APPROPRIATION_COMMAND &&
    commandType !== SOCIAL_POSITION_OFFER_CREATE_COMMAND
  )
    return true;
  if (isProductionManualIntakeRuntime(runtime)) return false;
  if (commandType === SOCIAL_POSITION_OFFER_CREATE_COMMAND)
    return (
      !!construction &&
      isPostwarSocialPositionSourceCommitProtectionPort(
        construction.readers.socialPosition?.sourceCommitProtectionPort,
      )
    );
  return (
    !!construction &&
    isFinanceBudgetNativeCommitGuard(
      construction.readers.financeBudget?.commitGuard,
    )
  );
}
