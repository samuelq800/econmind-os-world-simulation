/** Current read projection from the actual complete Core fold, including every
 * inventory operation. No source or command authority is issued here. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
} from '@econmind/core';
import {
  readFinanceSocialReplayContinuationView,
  type FinanceSocialReplayContinuationView,
} from '@econmind/core/finance-social-replay-continuation';
import { parseNarrowTreasuryGcuTransferTerms } from '@econmind/core';
import {
  parsePostwarTradeInventoryRow,
  parsePostwarTradeTransferRow,
} from '@econmind/core/postwar-trade-current-contract';
import {
  consumePostwarMixedCurrentProjectionSnapshotFrom,
  type PostwarMixedCurrentProjectionSnapshot,
} from './postwar-mixed-current-projection-publication.js';
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
export function derivePostwarTradeCurrentRows(input: {
  readonly replay: Readonly<FinanceSocialReplayContinuationView>;
  readonly countryId: string;
}) {
  const view = readFinanceSocialReplayContinuationView(input.replay, sha),
    country = input.countryId;
  if (
    !view.complete ||
    !/^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(country) ||
    !view.result.inventoryState
  )
    throw Error('TRADE_CURRENT_GENUINE_COMPLETE_INVENTORY_REQUIRED');
  const inventory = Object.freeze(
    view.result.inventoryState.balances
      .filter((b) => b.account.countryId === country)
      .map((b) => {
        const { worldId, ...account } = b.account;
        if (worldId !== view.worldId)
          throw Error('TRADE_CURRENT_INVENTORY_WORLD_MISMATCH');
        return parsePostwarTradeInventoryRow({
          schemaVersion: 'postwar-trade-current-inventory-row-v1',
          ...account,
          quantity: b.quantity.toCanonicalValue().amount,
        });
      }),
  );
  const transfers = Object.freeze(
    (view.result.narrowGoodsTransfers ?? [])
      .map((x) => ({
        x,
        terms: parseNarrowTreasuryGcuTransferTerms(x.transfer),
      }))
      .filter(
        ({ terms: t }) =>
          t.sellerCountryId === country || t.buyerCountryId === country,
      )
      .map(({ x, terms: t }) =>
        parsePostwarTradeTransferRow({
          schemaVersion: 'postwar-trade-current-transfer-row-v1',
          transferCommandId: x.transfer.commandId,
          transferFingerprint: x.transfer.fingerprint,
          sellerCountryId: t.sellerCountryId,
          buyerCountryId: t.buyerCountryId,
          commodityId: t.commodityId,
          batchId: t.assetSource.batchId,
          quantity: t.quantity.toCanonicalValue().amount,
          unit: t.quantity.unit,
          reservationId: x.reservation.reservationId,
          shipmentId: x.shipmentId,
          status: x.delivered
            ? 'DELIVERED'
            : x.shipmentId
              ? 'SHIPPED'
              : 'RESERVED',
        }),
      )
      .sort((a, b) =>
        a.transferCommandId < b.transferCommandId
          ? -1
          : a.transferCommandId > b.transferCommandId
            ? 1
            : 0,
      ),
  );
  return Object.freeze({
    inventory,
    transfers,
    inventoryRowsHash: hash(inventory),
    transferRowsHash: hash(transfers),
  });
}
export function derivePostwarTradeCurrentFrom(
  tx: SqlExecutor,
  token: PostwarMixedCurrentProjectionSnapshot,
) {
  const f = consumePostwarMixedCurrentProjectionSnapshotFrom(tx, token);
  if (f.historyMode !== 'PAGED_COMPLETE_V1' || !f.pagedReplay)
    throw Error('TRADE_CURRENT_PAGED_COMPLETE_SNAPSHOT_REQUIRED');
  const rows = derivePostwarTradeCurrentRows({
    replay: f.pagedReplay,
    countryId: f.countryId,
  });
  return Object.freeze({
    ...rows,
    assertion: canonicalSerialize({
      head: f.head,
      seedPins: f.seedPins,
      coverage: f.coverage,
      inventoryRowsHash: rows.inventoryRowsHash,
      transferRowsHash: rows.transferRowsHash,
    }),
  });
}
