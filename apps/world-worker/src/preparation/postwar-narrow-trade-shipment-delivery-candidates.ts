/** Fixed automatic Goods candidates. No pool/consumer/Clock/route or money is
 * created. Root Atomic must install the returned private source cutoff port. */
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  eventId,
  inventoryPostingId,
  outboxMessageId,
  financialPostingBatchId,
  financialPostingLegId,
  parseNarrowTreasuryGcuDeliveryTerms,
} from '@econmind/core';
import { DurableV08LedgerLineageReader } from '../persistence/durable-v08-ledger-lineage-reader.js';
import { prepareNarrowTreasuryGcuShipmentAtomicDraft } from '../persistence/narrow-treasury-gcu-shipment-draft.js';
import { prepareNarrowTreasuryGcuDeliveryAtomicDraft } from '../persistence/narrow-treasury-gcu-delivery-draft.js';
import {
  isPostwarNarrowTradeCurrentSource,
  type PostwarNarrowTradeCurrentSource,
} from '../persistence/postwar-narrow-trade-current-source.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from '../persistence/atomic-transition-repository.js';
import type { SqlDatabase } from '../persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Fixed automatic Goods: ' + message,
  );
}
const instances = new WeakSet<object>();
export function isPostwarNarrowTradeAutomaticRuntime(
  v: unknown,
): v is Readonly<PostwarNarrowTradeAutomaticRuntime> {
  return !!v && typeof v === 'object' && instances.has(v);
}
export interface PostwarNarrowTradeAutomaticRuntime {
  readonly worldId: string;
  readonly workerId: string;
  readonly database: SqlDatabase;
  readonly shipmentCandidateFactory: AtomicTransitionCandidateFactory;
  readonly deliveryCandidateFactory: AtomicTransitionCandidateFactory;
  readonly sourceCommitProtectionPort: PostwarNarrowTradeCurrentSource['sourceCommitProtectionPort'];
}
export function createPostwarNarrowTradeAutomaticRuntime(
  input: Readonly<{
    worldId: string;
    workerId: string;
    database: SqlDatabase;
    source: Readonly<PostwarNarrowTradeCurrentSource>;
  }>,
): Readonly<PostwarNarrowTradeAutomaticRuntime> {
  if (
    !isPostwarNarrowTradeCurrentSource(input.source, input.worldId) ||
    !/^[A-Z][A-Z0-9_-]*$/u.test(input.workerId)
  )
    invalid('genuine exact source and fixed worker required');
  const lineage = new DurableV08LedgerLineageReader({
    database: input.database,
    sha256Hex: sha,
  });
  const factory = (
    kind: 'SHIP' | 'DELIVER',
  ): AtomicTransitionCandidateFactory =>
    Object.freeze({
      async prepare(
        request: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
      ): Promise<AtomicTransitionDraft> {
        const c = request.command;
        if (
          request.commitAuthorization !== null ||
          c.officeId !== null ||
          c.worldId !== input.worldId ||
          c.commandType !==
            (kind === 'SHIP'
              ? 'CORE_GOODS_SHIPMENT_V1'
              : 'CORE_GOODS_DELIVERY_V1')
        )
          invalid(
            'fixed versioned automatic family without discretionary proof required',
          );
        return input.database.transaction(async (tx) => {
          await tx.query(
            'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for share',
            [input.worldId, c.commandId],
          );
          const durable = await lineage.readCommandFrom(
            tx,
            input.worldId,
            c.commandId,
          );
          if (canonicalSerialize(durable) !== canonicalSerialize(c))
            invalid('actual durable automatic command differs');
          const p = await input.source.inspectAutomaticFrom(tx, {
            command: c,
            workerId: input.workerId,
            observedAtReal: request.observedAtReal,
          });
          const common = {
            observedAtReal: request.observedAtReal,
            commitAssertion: p.commitAssertion,
            eventId: eventId(`GOODS_${kind}_EVENT_${c.commandId}`),
            eventSequence: String(BigInt(p.binding.head.eventSequence) + 1n),
            inventoryPostingId: inventoryPostingId(
              `GOODS_${kind}_INVENTORY_${c.commandId}`,
            ),
            outboxMessageId: outboxMessageId(
              `GOODS_${kind}_OUTBOX_${c.commandId}`,
            ),
            inventoryState: p.inventory,
            transferCommand: p.transferCommand,
            source: p.source,
            sha256Hex: sha,
          };
          if (kind === 'SHIP')
            return Object.freeze({
              ...prepareNarrowTreasuryGcuShipmentAtomicDraft({
                ...common,
                shipmentCommand: c,
              }),
              officeOperatingSourceReadBinding: p.binding,
            });
          const terms = parseNarrowTreasuryGcuDeliveryTerms({
              deliveryCommand: c,
              transferCommand: p.transferCommand,
              sha256Hex: sha,
            }),
            buyer = p.financial.accounts.find(
              (a) => a.accountId === terms.buyerTreasuryAccountId,
            ),
            seller = p.financial.accounts.find(
              (a) => a.accountId === terms.sellerSettlementAccountId,
            );
          if (!buyer || !seller)
            invalid('actual existing delivery GCU accounts required');
          const derived = prepareNarrowTreasuryGcuDeliveryAtomicDraft({
            ...common,
            deliveryCommand: c,
            financialState: p.financial,
            buyerTreasury: buyer,
            sellerSettlement: seller,
            financialBatchId: financialPostingBatchId(
              `GOODS_DELIVER_BATCH_${c.commandId}`,
            ),
            buyerTreasuryLegId: financialPostingLegId(
              `GOODS_DELIVER_BUYER_${c.commandId}`,
            ),
            sellerSettlementLegId: financialPostingLegId(
              `GOODS_DELIVER_SELLER_${c.commandId}`,
            ),
          });
          // Current pages are independently published. The source guard verifies no
          // arbitrary materialization; this candidate attaches none.
          return Object.freeze({
            ...derived.draft,
            currentMaterializations: Object.freeze([]),
            officeOperatingSourceReadBinding: p.binding,
          });
        });
      },
    });
  const runtime = Object.freeze({
    worldId: input.worldId,
    workerId: input.workerId,
    database: input.database,
    shipmentCandidateFactory: factory('SHIP'),
    deliveryCandidateFactory: factory('DELIVER'),
    sourceCommitProtectionPort: input.source.sourceCommitProtectionPort,
  });
  instances.add(runtime);
  return runtime;
}
