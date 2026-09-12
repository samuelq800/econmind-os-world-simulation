import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createInitialTransferFlowState,
  isCanonicalPositiveDecimal,
  transferFlowReducer,
} from '../../apps/world-web/src/prototype/transfer-flow.js';

const flowUi = readFileSync(
  'apps/world-web/src/prototype/GoodsTransferFlow.tsx',
  'utf8',
);
const flowReducer = readFileSync(
  'apps/world-web/src/prototype/transfer-flow.ts',
  'utf8',
);
const mockTransport = readFileSync(
  'apps/world-web/src/prototype/mock-transfer-transport.ts',
  'utf8',
);

describe('local goods-transfer preparation flow', () => {
  it('requires canonical positive decimal strings before it creates a review', () => {
    expect(isCanonicalPositiveDecimal('18000')).toBe(true);
    expect(isCanonicalPositiveDecimal('18000.5')).toBe(true);
    expect(isCanonicalPositiveDecimal('0')).toBe(false);
    expect(isCanonicalPositiveDecimal('01')).toBe(false);
    expect(isCanonicalPositiveDecimal('1e3')).toBe(false);

    const invalid = transferFlowReducer(createInitialTransferFlowState(), {
      type: 'EDIT_FIELD',
      field: 'quantityAmount',
      value: '01',
    });
    const reviewed = transferFlowReducer(invalid, { type: 'REQUEST_REVIEW' });
    expect(reviewed.status).toBe('DRAFT');
    expect(reviewed.errors.quantityAmount).toContain('canonical decimal');
  });

  it('creates a reversible local review without calculating a total or calling a runtime', () => {
    const review = transferFlowReducer(createInitialTransferFlowState(), {
      type: 'REQUEST_REVIEW',
    });
    expect(review.status).toBe('REVIEW');
    expect(review.review?.draft.quantity.amount).toBe('18000');
    expect(flowReducer).toContain('does not calculate or round a total');
    expect(flowUi).toContain('Back to grain network');
    expect(flowUi).toContain('Do not resend. Look up the final receipt');
    expect(mockTransport).not.toContain('fetch(');
  });

  it('keeps every user-visible message English', () => {
    for (const source of [flowUi, flowReducer, mockTransport]) {
      expect(source).not.toMatch(/[\u3400-\u9fff]/u);
    }
    expect(flowReducer).toContain('PREPARATION_ONLY_MARKER');
    expect(mockTransport).toContain('PREPARATION_ONLY_MARKER');
  });
});
