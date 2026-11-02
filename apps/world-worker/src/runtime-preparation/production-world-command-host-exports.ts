/** Server-only composition surface. Dependency registration is not admission,
 * a consumer permit, or authority to start World/Clock. Private registry stays private. */
export {
  createServerCommandHostBinding,
  createProductionWorldCommandHost,
  preflightProductionManualIntakeRuntime,
  WorkerRequestCompletion,
  trackWorkerRequestCompletion,
  type ProductionWorldCommandHost,
  type ServerCommandHostBinding,
  type ServerCommandHostDependencies,
} from './production-world-command-host.js';
