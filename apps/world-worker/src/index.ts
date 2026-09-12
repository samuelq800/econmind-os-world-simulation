export interface WorkerFoundationStatus {
  readonly role: 'future-authoritative-executor';
  readonly simulationEnabled: false;
}

export function getWorkerFoundationStatus(): WorkerFoundationStatus {
  return {
    role: 'future-authoritative-executor',
    simulationEnabled: false,
  };
}

export {
  createAuthoritativeWorkerExecution,
  createTransactionCutoffAuthorizationGuard,
  type AuthoritativeWorkerExecution,
  type CurrentCommitAuthorization,
  type ServerHeldCommitAuthorizationSource,
} from './authoritative-execution.js';
