import type { Pool } from 'pg';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  type CanonicalCommand,
  type Sha256Hex,
} from '@econmind/core';
import { PostgresTransactionError } from '../persistence/postgres-sql-database.js';
import type { SqlDatabase } from '../persistence/sql-database.js';
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
  const readers: ManualOfficeRuntimeReaders = {
    ...input.readers,
    ...(captain
      ? {
          captain: {
            async read(request) {
              const before = await head();
              const read = await captain.read(request);
              if (read.kind === 'READ') {
                const after = await head();
                if (
                  read.snapshot.worldVersion !== before.world_version ||
                  read.snapshot.lastEventSequence !== before.event_sequence ||
                  after.world_version !== before.world_version ||
                  after.event_sequence !== before.event_sequence
                )
                  throw new DomainError(
                    DOMAIN_ERROR_CODES.VERSION_MISMATCH,
                    'Captain source must bind actual stable head/sequence',
                  );
              }
              return read;
            },
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
  runtime: ManualOfficeIntakeRuntime | null | undefined,
  input: {
    pool: Pick<Pool, 'connect'>;
    clock: DurableConsumptionClock;
    worldId: string;
  },
): runtime is ManualOfficeIntakeRuntime {
  if (!runtime) return false;
  const construction = constructions.get(runtime);
  return (
    !!construction &&
    construction.intakePool === input.pool &&
    construction.clock === input.clock &&
    construction.worldId === input.worldId &&
    ['PREPARED', 'READY'].includes(runtime.consumer.state())
  );
}
export async function preflightManualOfficeIntakeRuntime(
  runtime: ManualOfficeIntakeRuntime,
  command: CanonicalCommand,
  observedAtReal: string,
): Promise<boolean> {
  const construction = constructions.get(runtime);
  if (
    !construction ||
    construction.worldId !== command.worldId ||
    !['PREPARED', 'READY'].includes(runtime.consumer.state())
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
    await composition.assertSourceBeforeClaim(observedAtReal);
    return ['PREPARED', 'READY'].includes(runtime.consumer.state());
  } catch (error) {
    if (
      isManualOfficeSourceMissing(error) ||
      (error instanceof PostgresTransactionError &&
        error.outcome === 'ROLLED_BACK' &&
        isManualOfficeSourceMissing(error.cause)) ||
      (error instanceof DomainError &&
        (error.code === DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID ||
          error.code === DOMAIN_ERROR_CODES.OPENING_SEED_INVALID))
    )
      return false;
    throw error;
  }
}
