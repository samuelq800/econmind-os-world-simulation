/** One fixed borrowed Trade installation for the existing shared consumer.
 * It creates no consumer, pool, source admission, Clock, grant or approval. */
import type { SqlDatabase } from '../persistence/sql-database.js';
import type { DurableConsumptionClock } from './durable-command-consumption.js';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  createPostwarNarrowTradeCurrentSourceFromSocial,
  type PostwarNarrowTradeCurrentSource,
} from '../persistence/postwar-narrow-trade-current-source.js';
import {
  createPostwarNarrowTradeAuthorizationDatabase,
  createPostwarNarrowTradeReservationRuntime,
  type PostwarNarrowTradeReservationRuntime,
} from './postwar-narrow-trade-reservation-candidate.js';
import {
  createPostwarNarrowTradeAutomaticRuntime,
  type PostwarNarrowTradeAutomaticRuntime,
} from './postwar-narrow-trade-shipment-delivery-candidates.js';
export interface PostwarNarrowTradeSharedRuntime {
  readonly classification: 'FIXED_SHARED_TRADE_FACTORIES_NOT_SOURCE_OR_EXECUTION_AUTHORITY';
  readonly worldId: string;
  readonly workerId: string;
  readonly database: Readonly<SqlDatabase>;
  readonly clock: DurableConsumptionClock;
  readonly source: Readonly<PostwarNarrowTradeCurrentSource>;
  readonly reservation: Readonly<PostwarNarrowTradeReservationRuntime>;
  readonly automatic: Readonly<PostwarNarrowTradeAutomaticRuntime>;
}
const issued = new WeakMap<object, Readonly<PostwarSocialRuntimeConnection>>();
export function createPostwarNarrowTradeSharedDatabase(
  database: SqlDatabase,
  worldId: string,
): Readonly<SqlDatabase> {
  return createPostwarNarrowTradeAuthorizationDatabase(database, { worldId });
}
export function isPostwarNarrowTradeSharedRuntime(
  value: unknown,
  worldId?: string,
): value is Readonly<PostwarNarrowTradeSharedRuntime> {
  if (!value || typeof value !== 'object') return false;
  const social = issued.get(value);
  return (
    !!social &&
    isPostwarSocialRuntimeConnection(social, worldId ?? social.worldId)
  );
}
export function readPostwarNarrowTradeSharedRuntime(
  value: Readonly<PostwarNarrowTradeSharedRuntime>,
): Readonly<PostwarNarrowTradeSharedRuntime> {
  if (!isPostwarNarrowTradeSharedRuntime(value))
    throw Error('GENUINE_LIVE_SHARED_TRADE_RUNTIME_REQUIRED');
  return value;
}
export function createPostwarNarrowTradeSharedRuntime(
  input: Readonly<{
    socialConnection: Readonly<PostwarSocialRuntimeConnection>;
    database: SqlDatabase;
    clock: DurableConsumptionClock;
    workerRole: string;
    environment?: 'local' | 'ci' | 'staging' | 'production';
  }>,
): Readonly<PostwarNarrowTradeSharedRuntime> {
  const social = input.socialConnection;
  if (!isPostwarSocialRuntimeConnection(social, social?.worldId))
    throw Error('GENUINE_SOCIAL_RUNTIME_CONNECTION_REQUIRED');
  if (
    readPostwarSocialRuntimeConnectionResources(social).workerRole !==
    input.workerRole
  )
    throw Error('SHARED_TRADE_EXACT_WORKER_ROLE_REQUIRED');
  const database = createPostwarNarrowTradeSharedDatabase(
    input.database,
    social.worldId,
  );
  if (database !== input.database)
    throw Error('SHARED_TRADE_FINAL_DATABASE_MUST_BE_PREBOUND');
  const source = createPostwarNarrowTradeCurrentSourceFromSocial({
    socialConnection: social,
    runtimeRole: input.workerRole,
    clock: input.clock,
    environment: input.environment ?? 'production',
    historyMode: 'PAGED',
  });
  const reservation = createPostwarNarrowTradeReservationRuntime({
      worldId: social.worldId,
      workerId: social.workerId,
      database,
      source,
    }),
    automatic = createPostwarNarrowTradeAutomaticRuntime({
      worldId: social.worldId,
      workerId: social.workerId,
      database,
      source,
    });
  if (reservation.database !== database || automatic.database !== database)
    throw Error('SHARED_TRADE_DATABASE_IDENTITY_CHANGED');
  const runtime: Readonly<PostwarNarrowTradeSharedRuntime> = Object.freeze({
    classification:
      'FIXED_SHARED_TRADE_FACTORIES_NOT_SOURCE_OR_EXECUTION_AUTHORITY',
    worldId: social.worldId,
    workerId: social.workerId,
    database,
    clock: input.clock,
    source,
    reservation,
    automatic,
  });
  issued.set(runtime, social);
  return runtime;
}
