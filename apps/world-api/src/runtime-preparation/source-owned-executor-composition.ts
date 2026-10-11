import {
  createProductionWorldCommandHost,
  type ServerCommandHostBinding,
} from '@econmind/world-worker/runtime-command-host';
import { createInternalExecutorCommandHandler } from './internal-executor-command-handler.js';
/** 3A has no actual owner source/clock/actor constructors. This fixed factory
 * remains entirely HOLD, including when a JS caller supplies forged bindings.
 * It does not invoke connection factories, SQL, consumers or borrowed callbacks.
 * The original internal adapter owns exact-route rejection and NOT_CONNECTED. */
export function createSourceOwnedExecutorComposition(
  binding: ServerCommandHostBinding | null = null,
) {
  const host = createProductionWorldCommandHost(binding);
  const handle = createInternalExecutorCommandHandler(null);
  return Object.freeze({
    preparationStatus: 'SOURCE_ONLY_UNMOUNTED_HOLD' as const,
    handle,
    stop: () => host.stop(),
  });
}
