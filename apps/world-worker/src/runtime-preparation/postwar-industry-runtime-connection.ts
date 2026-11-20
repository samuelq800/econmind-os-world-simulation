/** Borrowed Industry component for the existing sole shared consumer. It owns
 * only its pending source work; never a consumer, pool, lease, clock or issuer. */
import {
  createPostwarIndustryRuntime,
  isPostwarIndustryRuntime,
  isPreparedPostwarIndustryRuntime,
  type PostwarIndustryRuntime,
} from '../persistence/postwar-industry-runtime.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';
export interface PostwarIndustryRuntimeConnection {
  readonly worldId: string;
  readonly workerId: string;
  prepare(): Promise<void>;
  close(): Promise<void>;
}
export interface PostwarIndustryRuntimePorts {
  readonly worldId: string;
  readonly workerId: string;
  readonly clock: DurableConsumptionClock;
  readonly runtime: Readonly<PostwarIndustryRuntime>;
}
const bindings = new WeakMap<object, Readonly<PostwarIndustryRuntimePorts>>();
export function isPostwarIndustryRuntimeConnection(
  value: unknown,
  worldId?: string,
): value is Readonly<PostwarIndustryRuntimeConnection> {
  if (!value || typeof value !== 'object') return false;
  const ports = bindings.get(value);
  return (
    !!ports &&
    (worldId === undefined || ports.worldId === worldId) &&
    isPostwarIndustryRuntime(ports.runtime)
  );
}
export function isPreparedPostwarIndustryRuntimeConnection(
  value: unknown,
  worldId?: string,
): value is Readonly<PostwarIndustryRuntimeConnection> {
  return (
    isPostwarIndustryRuntimeConnection(value, worldId) &&
    isPreparedPostwarIndustryRuntime(bindings.get(value)!.runtime)
  );
}
export function readPostwarIndustryRuntimeBinding(
  value: Readonly<PostwarIndustryRuntimeConnection>,
): Readonly<PostwarIndustryRuntimePorts> {
  if (!isPostwarIndustryRuntimeConnection(value))
    throw Error('GENUINE_LIVE_INDUSTRY_RUNTIME_CONNECTION_REQUIRED');
  return bindings.get(value)!;
}
export function createPostwarIndustryRuntimeConnection(
  input: Parameters<typeof createPostwarIndustryRuntime>[0] &
    Readonly<{ workerId: string; clock: DurableConsumptionClock }>,
): Readonly<PostwarIndustryRuntimeConnection> {
  if (
    input.workerId !== input.socialConnection?.workerId ||
    !Object.isFrozen(input.clock) ||
    typeof Object.getOwnPropertyDescriptor(input.clock, 'nowReal')?.value !==
      'function' ||
    typeof Object.getOwnPropertyDescriptor(input.clock, 'simTime')?.value !==
      'function'
  )
    throw Error('INDUSTRY_EXACT_SHARED_WORKER_AND_SERVER_CLOCK_REQUIRED');
  const runtime = createPostwarIndustryRuntime(input),
    clock = input.clock;
  let closing: Promise<void> | undefined;
  const connection: Readonly<PostwarIndustryRuntimeConnection> = Object.freeze({
    worldId: runtime.worldId,
    workerId: input.workerId,
    prepare: () => runtime.prepare(),
    close() {
      if (closing) return closing;
      bindings.delete(connection);
      closing = runtime.close();
      return closing;
    },
  });
  bindings.set(
    connection,
    Object.freeze({
      worldId: runtime.worldId,
      workerId: input.workerId,
      clock,
      runtime,
    }),
  );
  return connection;
}
