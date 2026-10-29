/** Explicit one-shot after-commit derivation. No timer, queue claim, economic
 * retry or global notification delivery-state mutation. The fixed publisher
 * verifies the durable command/receipt/outbox and is same-head idempotent. */
import {
  isPostwarBoundedFinancialCurrentPublisher,
  type PostwarBoundedFinancialCurrentPublisher,
  type BoundedFinancialCurrentPublication,
} from '../persistence/postwar-bounded-financial-current-publication.js';

export type PostwarBudgetCurrentReadbackResult =
  | Readonly<{
      status: 'PUBLISHED';
      publication: BoundedFinancialCurrentPublication;
    }>
  | Readonly<{
      status: 'RETRY_PENDING';
      commandId: string;
      code: 'DERIVED_READBACK_UNAVAILABLE';
      commandResubmitted: false;
    }>;
export {
  createPostwarBoundedFinancialCurrentPublisher,
  type PostwarBoundedFinancialCurrentPublisher,
  type PostwarBoundedFinancialCurrentPublisherConfig,
  type BoundedFinancialCurrentPublication,
} from '../persistence/postwar-bounded-financial-current-publication.js';
export interface PostwarBudgetCurrentReadbackConsumerConfig {
  readonly publisher: PostwarBoundedFinancialCurrentPublisher;
}
export interface PostwarBudgetCurrentReadbackConsumer {
  dispatchCommittedCommand(
    commandId: string,
  ): Promise<PostwarBudgetCurrentReadbackResult>;
}
export function createPostwarBudgetCurrentReadbackConsumer(
  config: PostwarBudgetCurrentReadbackConsumerConfig,
): PostwarBudgetCurrentReadbackConsumer {
  if (!isPostwarBoundedFinancialCurrentPublisher(config.publisher))
    throw Error('FIXED_BOUNDED_FINANCIAL_PUBLISHER_REQUIRED');
  return Object.freeze({
    async dispatchCommittedCommand(
      commandId: string,
    ): Promise<PostwarBudgetCurrentReadbackResult> {
      try {
        return Object.freeze({
          status: 'PUBLISHED',
          publication:
            await config.publisher.publishCommittedCommand(commandId),
        });
      } catch {
        // The explicit host may retry this derivation after the backend recovers.
        // Neither this consumer nor a publication failure resubmits the command.
        return Object.freeze({
          status: 'RETRY_PENDING',
          commandId,
          code: 'DERIVED_READBACK_UNAVAILABLE',
          commandResubmitted: false,
        });
      }
    },
  });
}
