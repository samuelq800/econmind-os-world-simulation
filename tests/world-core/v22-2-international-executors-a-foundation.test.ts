import { describe, expect, it } from 'vitest';

import { createFoundationFact } from '../../packages/core/src/engine-kernels/foundation-provenance.js';
import {
  assertExecutorAReplayEvidence,
  prepareCommodityAgreement,
  prepareFdi,
  prepareInfrastructureFinance,
  prepareResourceDevelopment,
  prepareSovereignLoan,
  type CommodityAgreementState,
  type CommodityAgreementTerms,
  type FdiState,
  type FdiTerms,
  type InfrastructureFinanceState,
  type InfrastructureFinanceTerms,
  type ResourceDevelopmentState,
  type ResourceDevelopmentTerms,
  type SovereignLoanState,
  type SovereignLoanTerms,
} from '../../packages/core/src/engine-kernels/international-executors-a-foundation.js';
import type { InternationalContractFoundationSnapshot } from '../../packages/core/src/engine-kernels/international-contract-foundation.js';

const trace = {
  traceRef: 'TRACE.V22.2',
  calculationVersion: 'V22_2_EXECUTOR_A.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.22',
    sourceVersion: 'WORLD_VERSION.22',
    snapshotRef: 'SNAPSHOT.WORLD.22',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '22000', unit: 'sim_millisecond' },
} as const;
const money = (amount: string) => ({ amount, currency: 'GCU' });
const qty = (amount: string, unit: string) => ({ amount, unit });

const common = {
  executionRef: 'EXEC.1',
  contractRef: 'CONTRACT.1',
  contractStateRef: 'STATE.1',
  contractVersionRef: 'VERSION.1',
  fromPartyRef: 'PARTY.FROM',
  toPartyRef: 'PARTY.TO',
  executedAt: trace.snapshotAt,
  previouslyAppliedExecutionRefs: [],
};

function fixture<T extends typeof common, S>(
  activityType: string,
  terms: T,
  state: S,
) {
  const contract: InternationalContractFoundationSnapshot = {
    contractRef: 'CONTRACT.1',
    stateRef: 'STATE.1',
    activityType,
    partyRefs: ['PARTY.FROM', 'PARTY.TO'],
    versionRef: 'VERSION.1',
    version: qty('1', 'contract_version'),
    status: 'ACTIVE',
    structuredTerms: [
      {
        termRef: 'TERM.1',
        fieldRef: 'FIELD.EXECUTION',
        valueFactRef: 'FACT.TERMS',
        subtypeSchemaVersionRef: 'SCHEMA.1',
      },
    ],
    noteText: null,
    requiredOfficeRefs: ['OFFICE.TRADE'],
    approvals: [
      {
        approvalRef: 'APPROVAL.1',
        officeRef: 'OFFICE.TRADE',
        versionRef: 'VERSION.1',
        status: 'APPROVED',
        decisionRef: 'DECISION.1',
      },
    ],
    activeSignedVersionRef: 'VERSION.1',
  };
  const contractFact = createFoundationFact({
    trace,
    factRef: 'FACT.CONTRACT',
    sourceRef: 'SOURCE.CONTRACT',
    predecessorFactRefs: ['GENESIS.WORLD'],
    payload: contract,
  });
  const termsFact = createFoundationFact({
    trace,
    factRef: 'FACT.TERMS',
    sourceRef: 'SOURCE.TERMS',
    predecessorFactRefs: [contractFact.factRef],
    payload: terms,
  });
  const stateFact = createFoundationFact({
    trace,
    factRef: 'FACT.STATE',
    sourceRef: 'SOURCE.STATE',
    predecessorFactRefs: ['GENESIS.WORLD'],
    payload: state,
  });
  return { trace, contractFact, termsFact, stateFact, outputRef: 'OUTPUT.1' };
}

const commodityTerms: CommodityAgreementTerms = {
  ...common,
  commodityId: 'GRAIN',
  goodsQuantity: qty('2.5', 'tonne'),
  cashPayment: money('12.75'),
  deliveryEvidenceRef: 'DELIVERY.1',
  paymentEvidenceRef: 'PAYMENT.1',
};
const commodityState: CommodityAgreementState = {
  sellerPartyRef: 'PARTY.FROM',
  buyerPartyRef: 'PARTY.TO',
  commodityId: 'GRAIN',
  sellerCommittedGoods: qty('10', 'tonne'),
  buyerReceivedGoods: qty('1', 'tonne'),
  buyerCash: money('20'),
  sellerCash: money('3'),
};
const fdiTerms: FdiTerms = {
  ...common,
  cashContribution: money('20.25'),
  issuedShares: qty('2.5', 'share'),
  ownershipInstrumentRef: 'EQUITY.1',
};
const fdiState: FdiState = {
  investorPartyRef: 'PARTY.FROM',
  targetPartyRef: 'PARTY.TO',
  investorCash: money('100'),
  targetCash: money('10'),
  totalIssuedShares: qty('10', 'share'),
  foreignInvestorShares: qty('2', 'share'),
  domesticHolderShares: qty('8', 'share'),
};
const loanTerms: SovereignLoanTerms = {
  ...common,
  principal: money('40.5'),
  debtInstrumentRef: 'DEBT.1',
};
const loanState: SovereignLoanState = {
  lenderPartyRef: 'PARTY.FROM',
  borrowerPartyRef: 'PARTY.TO',
  lenderCash: money('100'),
  borrowerCash: money('10'),
  lenderLoanAsset: money('5'),
  borrowerLoanLiability: money('5'),
};
const infraTerms: InfrastructureFinanceTerms = {
  ...common,
  mode: 'DEBT',
  cashContribution: money('15'),
  claimIncrease: money('15'),
  issuedShares: null,
  projectRef: 'PROJECT.1',
};
const infraState: InfrastructureFinanceState = {
  financierPartyRef: 'PARTY.FROM',
  projectPartyRef: 'PARTY.TO',
  financierCash: money('100'),
  projectCash: money('10'),
  financierDebtAsset: money('5'),
  projectDebtLiability: money('5'),
  totalIssuedShares: qty('10', 'share'),
  financierShares: qty('2', 'share'),
  domesticHolderShares: qty('8', 'share'),
};
const resourceTerms: ResourceDevelopmentTerms = {
  ...common,
  cashContribution: money('12'),
  rightShareTransferred: qty('0.25', 'right_share'),
  resourceAssetRef: 'RESOURCE.1',
  developmentRightRef: 'RIGHT.1',
};
const resourceState: ResourceDevelopmentState = {
  foreignPartyRef: 'PARTY.FROM',
  hostPartyRef: 'PARTY.TO',
  resourceAssetRef: 'RESOURCE.1',
  foreignCash: money('100'),
  hostCash: money('10'),
  foreignRightShare: qty('0.1', 'right_share'),
  hostRightShare: qty('0.9', 'right_share'),
  geologicalEndowment: qty('1000', 'tonne'),
};

describe('V22.2 international executors A pure preparation', () => {
  it('pairs exact commodity cash and goods with before/delta/after and causal facts', () => {
    const input = fixture(
      'Commodity Supply Agreement',
      commodityTerms,
      commodityState,
    );
    const result = prepareCommodityAgreement(input);
    expect(result.after).toMatchObject({
      buyerCash: money('7.25'),
      sellerCash: money('15.75'),
      sellerCommittedGoods: qty('7.5', 'tonne'),
      buyerReceivedGoods: qty('3.5', 'tonne'),
    });
    expect(result.transitions.map((t) => t.delta)).toEqual([
      money('-12.75'),
      money('12.75'),
      qty('-2.5', 'tonne'),
      qty('2.5', 'tonne'),
    ]);
    expect(
      result.transitions.every(
        (t) =>
          t.causalFactRefs.join(',') === 'FACT.CONTRACT,FACT.TERMS,FACT.STATE',
      ),
    ).toBe(true);
    assertExecutorAReplayEvidence(result.replayProof, [
      input.contractFact,
      input.termsFact,
      input.stateFact,
    ]);
    expect(prepareCommodityAgreement(input)).toEqual(result);
  });

  it('pairs FDI cash with new issuer and investor shares', () => {
    const result = prepareFdi(
      fixture('Foreign Direct Investment', fdiTerms, fdiState),
    );
    expect(result.after).toMatchObject({
      investorCash: money('79.75'),
      targetCash: money('30.25'),
      totalIssuedShares: qty('12.5', 'share'),
      foreignInvestorShares: qty('4.5', 'share'),
      domesticHolderShares: qty('8', 'share'),
    });
    expect(result.transitions.map((t) => t.domain)).toEqual([
      'CASH',
      'CASH',
      'EQUITY_LIABILITY',
      'EQUITY_ASSET',
    ]);
  });

  it('pairs sovereign loan cash, lender asset and borrower liability', () => {
    const result = prepareSovereignLoan(
      fixture('Sovereign Loan', loanTerms, loanState),
    );
    expect(result.after).toMatchObject({
      lenderCash: money('59.5'),
      borrowerCash: money('50.5'),
      lenderLoanAsset: money('45.5'),
      borrowerLoanLiability: money('45.5'),
    });
    expect(result.transitions.map((t) => t.delta)).toEqual([
      money('-40.5'),
      money('40.5'),
      money('40.5'),
      money('40.5'),
    ]);
  });

  it('keeps debt and equity infrastructure modes distinct', () => {
    const debt = prepareInfrastructureFinance(
      fixture('Infrastructure Finance', infraTerms, infraState),
    );
    expect(debt.after).toMatchObject({
      financierCash: money('85'),
      projectCash: money('25'),
      financierDebtAsset: money('20'),
      projectDebtLiability: money('20'),
    });
    expect(debt.transitions.map((t) => t.domain)).toEqual([
      'CASH',
      'CASH',
      'DEBT_ASSET',
      'DEBT_LIABILITY',
    ]);
    const equityTerms: InfrastructureFinanceTerms = {
      ...infraTerms,
      mode: 'EQUITY',
      claimIncrease: null,
      issuedShares: qty('3', 'share'),
    };
    const equity = prepareInfrastructureFinance(
      fixture('Infrastructure Finance', equityTerms, infraState),
    );
    expect(equity.after).toMatchObject({
      financierCash: money('85'),
      projectCash: money('25'),
      totalIssuedShares: qty('13', 'share'),
      financierShares: qty('5', 'share'),
    });
    expect(equity.transitions.map((t) => t.domain)).toEqual([
      'CASH',
      'CASH',
      'EQUITY_LIABILITY',
      'EQUITY_ASSET',
    ]);
  });

  it('transfers bounded resource rights and cash without creating geological stock', () => {
    const result = prepareResourceDevelopment(
      fixture('Resource Development Agreement', resourceTerms, resourceState),
    );
    expect(result.after).toMatchObject({
      foreignCash: money('88'),
      hostCash: money('22'),
      foreignRightShare: qty('0.35', 'right_share'),
      hostRightShare: qty('0.65', 'right_share'),
      geologicalEndowment: qty('1000', 'tonne'),
    });
  });

  it('fails closed on stale contract, wrong party/term, duplicate execution and insufficient goods/cash', () => {
    const base = fixture(
      'Commodity Supply Agreement',
      commodityTerms,
      commodityState,
    );
    expect(() =>
      prepareCommodityAgreement({
        ...base,
        contractFact: createFoundationFact({
          trace,
          factRef: 'FACT.CONTRACT',
          sourceRef: 'SOURCE.CONTRACT',
          predecessorFactRefs: ['GENESIS.WORLD'],
          payload: { ...base.contractFact.payload, status: 'DRAFT' as const },
        }),
      }),
    ).toThrow();
    expect(() =>
      prepareCommodityAgreement(
        fixture(
          'Commodity Supply Agreement',
          { ...commodityTerms, fromPartyRef: 'PARTY.WRONG' },
          commodityState,
        ),
      ),
    ).toThrow();
    expect(() =>
      prepareCommodityAgreement(
        fixture(
          'Commodity Supply Agreement',
          { ...commodityTerms, contractVersionRef: 'VERSION.OLD' },
          commodityState,
        ),
      ),
    ).toThrow();
    expect(() =>
      prepareCommodityAgreement(
        fixture(
          'Commodity Supply Agreement',
          { ...commodityTerms, previouslyAppliedExecutionRefs: ['EXEC.1'] },
          commodityState,
        ),
      ),
    ).toThrow();
    expect(() =>
      prepareCommodityAgreement(
        fixture('Commodity Supply Agreement', commodityTerms, {
          ...commodityState,
          sellerCommittedGoods: qty('2', 'tonne'),
        }),
      ),
    ).toThrow();
    expect(() =>
      prepareCommodityAgreement(
        fixture('Commodity Supply Agreement', commodityTerms, {
          ...commodityState,
          buyerCash: money('12'),
        }),
      ),
    ).toThrow();
    expect(() =>
      prepareCommodityAgreement(
        fixture('Sovereign Loan', commodityTerms, commodityState),
      ),
    ).toThrow();
  });

  it('fails closed on imbalanced claims/shares, invalid mode and oversized rights', () => {
    expect(() =>
      prepareSovereignLoan(
        fixture('Sovereign Loan', loanTerms, {
          ...loanState,
          borrowerLoanLiability: money('6'),
        }),
      ),
    ).toThrow();
    expect(() =>
      prepareFdi(
        fixture('Foreign Direct Investment', fdiTerms, {
          ...fdiState,
          domesticHolderShares: qty('7', 'share'),
        }),
      ),
    ).toThrow();
    expect(() =>
      prepareInfrastructureFinance(
        fixture(
          'Infrastructure Finance',
          { ...infraTerms, issuedShares: qty('1', 'share') },
          infraState,
        ),
      ),
    ).toThrow();
    expect(() =>
      prepareResourceDevelopment(
        fixture(
          'Resource Development Agreement',
          {
            ...resourceTerms,
            rightShareTransferred: qty('0.91', 'right_share'),
          },
          resourceState,
        ),
      ),
    ).toThrow();
  });

  it('rejects forged payload, mixed snapshot and replay proof mutation', () => {
    const input = fixture(
      'Commodity Supply Agreement',
      commodityTerms,
      commodityState,
    );
    const forged = {
      ...input.termsFact,
      payload: { ...commodityTerms, cashPayment: money('1') },
    };
    expect(() =>
      prepareCommodityAgreement({ ...input, termsFact: forged }),
    ).toThrow();
    const mixed = {
      ...input.stateFact,
      snapshot: { ...trace.snapshot, snapshotHash: 'c'.repeat(64) },
    };
    expect(() =>
      prepareCommodityAgreement({ ...input, stateFact: mixed }),
    ).toThrow();
    const proof = prepareCommodityAgreement(input).replayProof;
    expect(() =>
      assertExecutorAReplayEvidence({ ...proof, outputRef: 'OUTPUT.FORGED' }, [
        input.contractFact,
        input.termsFact,
        input.stateFact,
      ]),
    ).toThrow();
    expect(() =>
      assertExecutorAReplayEvidence(proof, [
        input.contractFact,
        input.stateFact,
        input.termsFact,
      ]),
    ).toThrow();
  });
});
