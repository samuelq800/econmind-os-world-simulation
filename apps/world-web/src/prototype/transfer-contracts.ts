import { PREPARATION_ONLY_MARKER } from './contracts.js';

export const PROTOTYPE_GOODS_TRANSFER_COMMAND_TYPE =
  'CORE_GOODS_TRANSFER_V1' as const;

export type PrototypeTransferScenario =
  | 'COMMITTED'
  | 'REJECTED'
  | 'UNKNOWN_OUTCOME'
  | 'STALE_WORLD_VERSION'
  | 'AUTHORIZATION_REVOKED';

export type EditableTransferField = 'quantityAmount' | 'unitPriceAmount';

export interface PrototypeGoodsTransferDraft {
  readonly marker: typeof PREPARATION_ONLY_MARKER;
  readonly commandType: typeof PROTOTYPE_GOODS_TRANSFER_COMMAND_TYPE;
  readonly worldId: string;
  readonly sellerCountryId: string;
  readonly buyerCountryId: string;
  readonly sellerOfficeId: 'TRADE';
  readonly buyerTradeOfficeId: 'TRADE';
  readonly buyerFinanceOfficeId: 'FINANCE';
  readonly commodityId: 'GRAIN';
  readonly quantity: {
    readonly amount: string;
    readonly unit: 'tonne';
  };
  readonly unitPrice: {
    readonly amount: string;
    readonly currency: 'GCU';
    readonly perUnit: 'tonne';
  };
  readonly settlementSource: 'BUYER_TREASURY_GCU';
  readonly expectedWorldVersion: string;
  readonly authorizationVersion: string;
  readonly idempotencyKey: string;
  readonly simTime: string;
}

export interface PrototypeTransferReview {
  readonly draft: PrototypeGoodsTransferDraft;
  readonly localReviewKey: string;
  readonly reviewedWorldVersion: string;
  readonly reviewedAuthorizationVersion: string;
}

export interface PrototypeGoodsTransferSubmitEnvelope {
  readonly marker: typeof PREPARATION_ONLY_MARKER;
  readonly schemaVersion: 'prototype-command-envelope-v1';
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly officeId: 'TRADE';
  readonly commandType: typeof PROTOTYPE_GOODS_TRANSFER_COMMAND_TYPE;
  readonly expectedWorldVersion: string;
  readonly authorizationVersion: string;
  readonly simTime: string;
  readonly payload: {
    readonly sellerCountryId: string;
    readonly buyerCountryId: string;
    readonly commodityId: 'GRAIN';
    readonly quantity: PrototypeGoodsTransferDraft['quantity'];
    readonly unitPrice: PrototypeGoodsTransferDraft['unitPrice'];
    readonly settlementSource: 'BUYER_TREASURY_GCU';
  };
  readonly localReviewKey: string;
}

export interface PrototypeTransferReceipt {
  readonly marker: typeof PREPARATION_ONLY_MARKER;
  readonly schemaVersion: 'command-receipt-v2';
  readonly worldId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: 'MOCK_FINGERPRINT_NOT_AUTHORITATIVE';
  readonly outcome: 'COMMITTED' | 'REJECTED' | 'AUTHORIZATION_REVOKED';
  readonly reasonCode: string | null;
  readonly transitionId: string | null;
  readonly worldVersionBefore: string | null;
  readonly worldVersionAfter: string | null;
  readonly simTime: string;
  readonly eventIds: readonly string[];
  readonly recordedAtReal: string;
}

export type PrototypeSubmitResult =
  | {
      readonly kind: 'FINAL';
      readonly receipt: PrototypeTransferReceipt;
    }
  | {
      readonly kind: 'UNKNOWN_OUTCOME';
      readonly commandId: string;
    }
  | {
      readonly kind: 'STALE_WORLD_VERSION';
      readonly expectedWorldVersion: string;
      readonly currentWorldVersion: string;
    }
  | {
      readonly kind: 'AUTHORIZATION_REVOKED';
      readonly reason: string;
    };

export interface PrototypeGoodsTransferTransport {
  submit(
    command: PrototypeGoodsTransferSubmitEnvelope,
  ): Promise<PrototypeSubmitResult>;
  lookupReceipt(commandId: string): Promise<PrototypeTransferReceipt | null>;
}
