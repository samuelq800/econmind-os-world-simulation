/** Fixed explicit composition; no caller candidate/facts callback or Ready
 * flag. A lost process-local immutable preparation stays disconnected. */
import {
  createManualOfficeIntakeRuntime,
  createRegisteredFinanceManualOfficeIntakeRuntime,
  type ManualOfficeIntakeRuntime,
} from './manual-office-intake-runtime.js';
import { createPostgresFinanceBudgetNativeRuntime } from '../persistence/postgres-finance-budget-custody.js';
import {
  isPreparedFinanceBudgetSource,
  type PreparedFinanceBudgetSource,
} from '../persistence/prepared-finance-budget-source.js';
import {
  isPostgresFinanceBudgetCapacitySource,
  type PostgresFinanceBudgetCapacitySource,
} from '../persistence/postgres-finance-budget-capacity-source.js';
import type { ServerCommandHostBinding } from '../runtime-preparation/production-world-command-host.js';
const instances = new WeakSet<object>();
export function isBoundedFinanceBudgetIntakeRuntime(
  value: unknown,
): value is ManualOfficeIntakeRuntime {
  return !!value && typeof value === 'object' && instances.has(value);
}
export function createBoundedFinanceBudgetIntakeRuntime(
  config: Omit<
    Parameters<typeof createManualOfficeIntakeRuntime>[0],
    'readers'
  > & { readonly capacitySource: PostgresFinanceBudgetCapacitySource },
) {
  if (
    !isPostgresFinanceBudgetCapacitySource(
      config.capacitySource,
      config.worldId,
    )
  )
    throw Error('FIXED_BUDGET_CAPACITY_SOURCE_REQUIRED');
  const budget = createPostgresFinanceBudgetNativeRuntime({
    database: config.workerDatabase,
    workerId: config.workerId,
    sha256Hex: config.sha256Hex,
    capacitySource: config.capacitySource,
  });
  const runtime = createManualOfficeIntakeRuntime({
    ...config,
    readers: { financeBudget: budget },
  });
  instances.add(runtime);
  return Object.freeze({ runtime, budget });
}
/** Formal server dependency installation, not Clock/consumer activation. */
export function createProductionBoundedFinanceBudgetIntakeRuntime(input: {
  readonly binding: ServerCommandHostBinding;
}) {
  const result = createRegisteredFinanceManualOfficeIntakeRuntime(
    input.binding,
  );
  instances.add(result.runtime);
  return result;
}
export function createPreparedFinanceBudgetIntakeRuntime(
  config: Omit<
    Parameters<typeof createManualOfficeIntakeRuntime>[0],
    'readers'
  > & { readonly preparedSource: PreparedFinanceBudgetSource },
) {
  if (!isPreparedFinanceBudgetSource(config.preparedSource, config.worldId))
    throw Error('GENUINE_PREPARED_BUDGET_SOURCE_REQUIRED');
  const budget = createPostgresFinanceBudgetNativeRuntime({
    database: config.workerDatabase,
    workerId: config.workerId,
    sha256Hex: config.sha256Hex,
    preparedSource: config.preparedSource,
  });
  const runtime = createManualOfficeIntakeRuntime({
    ...config,
    readers: { financeBudget: budget },
  });
  instances.add(runtime);
  return Object.freeze({ runtime, budget });
}
