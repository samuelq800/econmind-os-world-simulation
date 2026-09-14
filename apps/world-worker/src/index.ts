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
} from './authoritative-execution.js';
export * from './projections/world-read-projection-publisher.js';
export * from './projections/current-authorization-entitlement-publisher.js';
export * from './projections/authoritative-activity-read-projection-publisher.js';
export * from './projections/current-negotiation-party-read-publisher.js';
export {
  createNarrowTransferApprovalStore,
  NarrowTransferApprovalStore,
  type AtomicNarrowTransferApprovalGuard,
  type NarrowTransferApprovalSigner,
} from './persistence/narrow-transfer-approval-store.js';
