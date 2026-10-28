import type { Pool } from 'pg';
import { FINANCE_BUDGET_APPROPRIATION_COMMAND } from '@econmind/core/authenticated-office-command-contract';
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
} from '../runtime-preparation/production-world-command-host.js';
import {
  createDurableCommandConsumptionPreparation,
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
};
const constructions = new WeakMap<ManualOfficeIntakeRuntime, Construction>();

/** Fixed existing source/factory and sole consumer constructors only. No
 * caller candidate, readiness predicate, boolean READY or executable callback. */
export function createManualOfficeIntakeRuntime(
  input: Construction,
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
  });
  const consumer = createDurableCommandConsumptionPreparation({
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
  if (
    commandType !== FINANCE_BUDGET_APPROPRIATION_COMMAND &&
    commandType !== SOCIAL_POSITION_OFFER_CREATE_COMMAND
  )
    return true;
  if (isProductionManualIntakeRuntime(runtime)) return false;
  const construction = constructions.get(runtime as ManualOfficeIntakeRuntime);
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
