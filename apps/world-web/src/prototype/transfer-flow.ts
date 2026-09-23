import { PREPARATION_ONLY_MARKER } from './contracts.js';
import {
  PROTOTYPE_GOODS_TRANSFER_COMMAND_TYPE,
  type EditableTransferField,
  type PrototypeGoodsTransferDraft,
  type PrototypeGoodsTransferSubmitEnvelope,
  type PrototypeTransferReceipt,
  type PrototypeTransferReview,
} from './transfer-contracts.js';

export type PrototypeTransferFlowStatus =
  | 'DRAFT'
  | 'REVIEW'
  | 'PENDING'
  | 'UNKNOWN_OUTCOME'
  | 'LOOKING_UP_RECEIPT'
  | 'STALE_WORLD_VERSION'
  | 'FINAL'
  | 'AUTHORIZATION_REVOKED';

export type PrototypeTransferFieldErrors = Partial<
  Readonly<Record<EditableTransferField, string>>
>;

export interface PrototypeTransferFlowState {
  readonly status: PrototypeTransferFlowStatus;
  readonly draft: PrototypeGoodsTransferDraft | null;
  readonly errors: PrototypeTransferFieldErrors;
  readonly review: PrototypeTransferReview | null;
  readonly pendingCommandId: string | null;
  readonly receipt: PrototypeTransferReceipt | null;
  readonly message: string | null;
}

export type PrototypeTransferFlowAction =
  | { readonly type: 'RESET' }
  | {
      readonly type: 'EDIT_FIELD';
      readonly field: EditableTransferField;
      readonly value: string;
    }
  | { readonly type: 'REQUEST_REVIEW' }
  | { readonly type: 'RETURN_TO_DRAFT' }
  | { readonly type: 'SUBMIT_STARTED'; readonly commandId: string }
  | {
      readonly type: 'STALE_WORLD_VERSION';
      readonly currentWorldVersion: string;
    }
  | { readonly type: 'REOPEN_AFTER_STALE' }
  | { readonly type: 'UNKNOWN_OUTCOME'; readonly commandId: string }
  | { readonly type: 'LOOKUP_STARTED' }
  | { readonly type: 'LOOKUP_NOT_FOUND' }
  | {
      readonly type: 'FINAL_RECEIPT';
      readonly receipt: PrototypeTransferReceipt;
    }
  | { readonly type: 'AUTHORIZATION_REVOKED'; readonly reason: string };

const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;

export const INITIAL_TRANSFER_DRAFT: PrototypeGoodsTransferDraft = {
  marker: PREPARATION_ONLY_MARKER,
  commandType: PROTOTYPE_GOODS_TRANSFER_COMMAND_TYPE,
  worldId: 'WORLD-PROTOTYPE-ONLY',
  sellerCountryId: 'COUNTRY-NORTHSTAR',
  buyerCountryId: 'COUNTRY-MERIDIAN',
  sellerOfficeId: 'TRADE',
  buyerTradeOfficeId: 'TRADE',
  buyerFinanceOfficeId: 'FINANCE',
  commodityId: 'GRAIN',
  quantity: { amount: '18000', unit: 'tonne' },
  unitPrice: { amount: '240', currency: 'GCU', perUnit: 'tonne' },
  settlementSource: 'BUYER_TREASURY_GCU',
  expectedWorldVersion: '1842',
  authorizationVersion: 'AUTH-PREVIEW-17',
  idempotencyKey: 'TRANSFER_PROTOTYPE_001',
  simTime: '51768000000',
};

export function isCanonicalPositiveDecimal(value: string): boolean {
  return (
    CANONICAL_DECIMAL.test(value) &&
    !/^0(?:\.0+)?$/u.test(value) &&
    value.replace('.', '').length <= 120
  );
}

export function validateTransferDraft(
  draft: PrototypeGoodsTransferDraft,
): PrototypeTransferFieldErrors {
  const errors: Record<string, string> = {};
  if (!isCanonicalPositiveDecimal(draft.quantity.amount)) {
    errors.quantityAmount =
      'Enter a canonical decimal above 0, such as 18000 or 18000.5.';
  }
  if (!isCanonicalPositiveDecimal(draft.unitPrice.amount)) {
    errors.unitPriceAmount =
      'Enter a canonical GCU unit price above 0. This prototype does not calculate or round a total.';
  }
  return errors;
}

export function localReviewKey(draft: PrototypeGoodsTransferDraft): string {
  return [
    draft.commandType,
    draft.worldId,
    draft.sellerCountryId,
    draft.buyerCountryId,
    draft.commodityId,
    draft.quantity.amount,
    draft.quantity.unit,
    draft.unitPrice.amount,
    draft.unitPrice.currency,
    draft.unitPrice.perUnit,
    draft.settlementSource,
    draft.expectedWorldVersion,
    draft.authorizationVersion,
    draft.idempotencyKey,
    draft.simTime,
  ].join('|');
}

export function createTransferReview(
  draft: PrototypeGoodsTransferDraft,
): PrototypeTransferReview {
  return {
    draft,
    localReviewKey: localReviewKey(draft),
    reviewedWorldVersion: draft.expectedWorldVersion,
    reviewedAuthorizationVersion: draft.authorizationVersion,
  };
}

export function createSubmitEnvelope(
  review: PrototypeTransferReview,
  commandId: string,
): PrototypeGoodsTransferSubmitEnvelope {
  const { draft } = review;
  return {
    marker: PREPARATION_ONLY_MARKER,
    schemaVersion: 'prototype-command-envelope-v1',
    commandId,
    idempotencyKey: draft.idempotencyKey,
    worldId: draft.worldId,
    countryId: draft.sellerCountryId,
    officeId: draft.sellerOfficeId,
    commandType: draft.commandType,
    expectedWorldVersion: review.reviewedWorldVersion,
    authorizationVersion: review.reviewedAuthorizationVersion,
    simTime: draft.simTime,
    payload: {
      sellerCountryId: draft.sellerCountryId,
      buyerCountryId: draft.buyerCountryId,
      commodityId: draft.commodityId,
      quantity: draft.quantity,
      unitPrice: draft.unitPrice,
      settlementSource: draft.settlementSource,
    },
    localReviewKey: review.localReviewKey,
  };
}

export function createInitialTransferFlowState(): PrototypeTransferFlowState {
  return {
    status: 'DRAFT',
    draft: INITIAL_TRANSFER_DRAFT,
    errors: {},
    review: null,
    pendingCommandId: null,
    receipt: null,
    message: null,
  };
}

function editDraft(
  draft: PrototypeGoodsTransferDraft,
  field: EditableTransferField,
  value: string,
): PrototypeGoodsTransferDraft {
  if (field === 'quantityAmount') {
    return { ...draft, quantity: { ...draft.quantity, amount: value } };
  }
  return { ...draft, unitPrice: { ...draft.unitPrice, amount: value } };
}

export function transferFlowReducer(
  state: PrototypeTransferFlowState,
  action: PrototypeTransferFlowAction,
): PrototypeTransferFlowState {
  if (action.type === 'AUTHORIZATION_REVOKED') {
    return {
      status: 'AUTHORIZATION_REVOKED',
      draft: null,
      errors: {},
      review: null,
      pendingCommandId: null,
      receipt: null,
      message: action.reason,
    };
  }

  switch (action.type) {
    case 'RESET':
      return createInitialTransferFlowState();
    case 'EDIT_FIELD': {
      if (state.status !== 'DRAFT' || !state.draft) return state;
      const nextDraft = editDraft(state.draft, action.field, action.value);
      const nextErrors = { ...state.errors };
      delete nextErrors[action.field];
      return { ...state, draft: nextDraft, errors: nextErrors, message: null };
    }
    case 'REQUEST_REVIEW': {
      if (state.status !== 'DRAFT' || !state.draft) return state;
      const errors = validateTransferDraft(state.draft);
      if (Object.keys(errors).length > 0) {
        return {
          ...state,
          errors,
          message: 'Fix the marked fields before review.',
        };
      }
      return {
        ...state,
        status: 'REVIEW',
        errors: {},
        review: createTransferReview(state.draft),
        message: null,
      };
    }
    case 'RETURN_TO_DRAFT':
      if (state.status !== 'REVIEW') return state;
      return { ...state, status: 'DRAFT', review: null, message: null };
    case 'SUBMIT_STARTED':
      if (state.status !== 'REVIEW' || !state.review) return state;
      return {
        ...state,
        status: 'PENDING',
        pendingCommandId: action.commandId,
        message:
          'Local mock handling started. The same draft cannot submit twice.',
      };
    case 'STALE_WORLD_VERSION':
      if (!state.draft) return state;
      return {
        ...state,
        status: 'STALE_WORLD_VERSION',
        draft: {
          ...state.draft,
          expectedWorldVersion: action.currentWorldVersion,
        },
        review: null,
        pendingCommandId: null,
        message: `World advanced to v${action.currentWorldVersion}; the old review expired.`,
      };
    case 'REOPEN_AFTER_STALE':
      if (state.status !== 'STALE_WORLD_VERSION') return state;
      return { ...state, status: 'DRAFT', message: null };
    case 'UNKNOWN_OUTCOME':
      if (state.status !== 'PENDING') return state;
      return {
        ...state,
        status: 'UNKNOWN_OUTCOME',
        pendingCommandId: action.commandId,
        message:
          'The result is unknown. Look up the receipt for this command ID; do not resend automatically.',
      };
    case 'LOOKUP_STARTED':
      if (state.status !== 'UNKNOWN_OUTCOME') return state;
      return {
        ...state,
        status: 'LOOKING_UP_RECEIPT',
        message:
          'Looking up the local mock receipt by the original command ID…',
      };
    case 'LOOKUP_NOT_FOUND':
      if (state.status !== 'LOOKING_UP_RECEIPT') return state;
      return {
        ...state,
        status: 'UNKNOWN_OUTCOME',
        message:
          'No final receipt yet. The flow still will not resubmit automatically.',
      };
    case 'FINAL_RECEIPT':
      return {
        ...state,
        status: 'FINAL',
        pendingCommandId: action.receipt.commandId,
        receipt: action.receipt,
        message: null,
      };
  }
}
