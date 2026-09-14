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
export { NarrowTreasuryGcuDeliveryProjectionRebuilder } from './projections/narrow-treasury-gcu-delivery-projection.js';
export {
  NarrowTreasuryGcuDeliveryOutboxConsumer,
  type NarrowTreasuryGcuDeliveryOutboxDisposition,
  type NarrowTreasuryGcuDeliveryOutboxMessage,
  type NarrowTreasuryGcuDeliveryOutboxResult,
  type NarrowTreasuryGcuDeliveryOutboxSink,
} from './outbox/narrow-treasury-gcu-delivery-outbox-consumer.js';
export {
  createNarrowTransferApprovalStore,
  NarrowTransferApprovalStore,
  type AtomicNarrowTransferApprovalGuard,
  type NarrowTransferApprovalSigner,
} from './persistence/narrow-transfer-approval-store.js';
export {
  NARROW_TREASURY_GCU_DELIVERY_EVENT_SCHEMA,
  NARROW_TREASURY_GCU_DELIVERY_EVENT_TYPE,
  NARROW_TREASURY_GCU_DELIVERY_MATERIALIZATION_KEY,
  NARROW_TREASURY_GCU_DELIVERY_MATERIALIZATION_SCHEMA,
  NARROW_TREASURY_GCU_DELIVERY_OUTBOX_SCHEMA,
  createNarrowTreasuryGcuDeliveryCandidateFactory,
  createNarrowTreasuryGcuDeliveryMaterialization,
  prepareNarrowTreasuryGcuDeliveryAtomicDraft,
  type NarrowTreasuryGcuDeliveryPreparationSource,
} from './persistence/narrow-treasury-gcu-delivery-draft.js';
