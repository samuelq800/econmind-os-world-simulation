import { describe, expect, it } from 'vitest';

import {
  INTERNATIONAL_EXECUTORS_B_PREPARATION_COVERAGE,
  INTERNATIONAL_EXECUTORS_B_PREPARATION_STATUS,
  assertCompleteInternationalExecutorBPreparationCoverage,
  assertInternationalExecutorBReplayEvidence,
  calculateCommodityAidPreparation,
  calculateEmergencyConcessionalLoanPreparation,
  calculateGrantAidPreparation,
  calculateJointProjectPreparation,
  calculateProjectReconstructionAidPreparation,
  calculateReserveSwapPreparation,
  calculateTechnicalAssistancePreparation,
  calculateTechnologyLicencePreparation,
  calculateTradeDisputeCompensationPreparation,
  canonicalHashInput,
  createFoundationFact,
  validateInternationalTenderPreparation,
  validateSanctionPackagePreparation,
  validateStrategicPartnershipPreparation,
  validateTreatyPreparation,
  type CashAccountSnapshot,
  type CommodityAidExecution,
  type DebtPositionSnapshot,
  type EmergencyConcessionalLoanExecution,
  type FoundationTraceRequest,
  type GrantAidExecution,
  type InternationalExecutorBFact,
  type InternationalTenderValidationRequest,
  type InventoryAccountSnapshot,
  type JointProjectExecution,
  type ProjectReconstructionAidExecution,
  type ReserveSwapExecution,
  type SanctionPackageValidationRequest,
  type ServiceCapacitySnapshot,
  type ServiceReceiptSnapshot,
  type StrategicPartnershipValidationRequest,
  type TechnicalAssistanceExecution,
  type TechnologyLicenceExecution,
  type TradeDisputeCompensationExecution,
  type TreatyActivityType,
  type TreatyValidationRequest,
} from '../../packages/core/src/index.js';

const TRACE: FoundationTraceRequest = {
  traceRef: 'TRACE.V22.3.B',
  calculationVersion: 'V22_3_B_PREPARATION.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.22',
    sourceVersion: 'WORLD.VERSION.22.3',
    snapshotRef: 'SNAPSHOT.WORLD.22.3',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '22300', unit: 'sim_millisecond' },
};

const MONEY = (amount: string, currency = 'GCU') =>
  ({ amount, currency }) as const;
const Q = (amount: string, unit: string) => ({ amount, unit }) as const;

function fact<T>(
  factRef: string,
  payload: T,
  trace: FoundationTraceRequest = TRACE,
): InternationalExecutorBFact<T> {
  return createFoundationFact({
    trace,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: ['GENESIS.WORLD.22'],
    payload,
  });
}

function cash(
  factRef: string,
  accountRef: string,
  ownerRef: string,
  amount: string,
  currency = 'GCU',
) {
  return fact<CashAccountSnapshot>(factRef, {
    accountRef,
    ownerRef,
    balance: MONEY(amount, currency),
  });
}

function treaty(
  activityType: TreatyActivityType,
  sequence: string,
  patch: Partial<TreatyValidationRequest>,
) {
  return fact<TreatyValidationRequest>(`FACT.TREATY.${sequence}`, {
    validationRef: `VALIDATION.TREATY.${sequence}`,
    contractRef: `CONTRACT.TREATY.${sequence}`,
    activityType,
    partyRefs: ['COUNTRY.A', 'COUNTRY.B'],
    tariffScheduleRefs: [],
    quotaScheduleRefs: [],
    rulesOfOriginRefs: [],
    customsRuleRefs: [],
    sectorRefs: [],
    marketAccessRefs: [],
    disputeMechanismRef: null,
    effectiveAt: TRACE.snapshotAt,
    ...patch,
  });
}

describe('V22.3 executor B parallel preparation', () => {
  it('classifies all 23 subtypes without treating the common contract kernel as subtype evidence', () => {
    const matrix = assertCompleteInternationalExecutorBPreparationCoverage([
      ...INTERNATIONAL_EXECUTORS_B_PREPARATION_COVERAGE,
    ]);
    expect(matrix).toHaveLength(23);
    expect(
      matrix.filter((entry) => entry.coverage === 'EXACT_TRANSFER_PREPARATION'),
    ).toHaveLength(9);
    expect(
      matrix.filter(
        (entry) => entry.coverage === 'STRUCTURED_VALIDATION_PREPARATION',
      ),
    ).toHaveLength(8);
    expect(
      matrix.filter((entry) => entry.coverage === 'TYPE_ONLY_PENDING_V22_2'),
    ).toHaveLength(6);
    expect(
      matrix
        .filter((entry) => entry.coverage === 'TYPE_ONLY_PENDING_V22_2')
        .every((entry) => entry.evidenceRef === null),
    ).toBe(true);
    expect(() =>
      assertCompleteInternationalExecutorBPreparationCoverage(
        matrix.slice(0, 22),
      ),
    ).toThrow('exactly 23');
    expect(() =>
      assertCompleteInternationalExecutorBPreparationCoverage(
        [...matrix].reverse(),
      ),
    ).toThrow('fixed 23-type matrix');
  });

  it('calculates a technology licence fee and binds the technology right fact', () => {
    const licensor = cash(
      'FACT.CASH.LICENSOR',
      'ACCOUNT.LICENSOR',
      'COUNTRY.A',
      '10',
    );
    const licensee = cash(
      'FACT.CASH.LICENSEE',
      'ACCOUNT.LICENSEE',
      'COUNTRY.B',
      '100',
    );
    const execution = fact<TechnologyLicenceExecution>(
      'FACT.EXECUTION.LICENCE',
      {
        executionRef: 'EXECUTION.LICENCE.1',
        contractRef: 'CONTRACT.LICENCE.1',
        activityType: 'Technology Licence',
        payerAccountRef: 'ACCOUNT.LICENSEE',
        payeeAccountRef: 'ACCOUNT.LICENSOR',
        amount: MONEY('20'),
        purposeFactRef: 'FACT.PURPOSE.LICENCE',
        executedAt: TRACE.snapshotAt,
        technologyRef: 'TECHNOLOGY.SOLAR',
        licenceRightFactRef: 'FACT.RIGHT.LICENCE.1',
        licensorRef: 'COUNTRY.A',
        licenseeRef: 'COUNTRY.B',
      },
    );
    const result = calculateTechnologyLicencePreparation({
      trace: TRACE,
      licensorCashFact: licensor,
      licenseeCashFact: licensee,
      executionFact: execution,
    });
    expect(result).toMatchObject({
      preparationStatus: INTERNATIONAL_EXECUTORS_B_PREPARATION_STATUS,
      activityType: 'Technology Licence',
      output: {
        payer: { balance: MONEY('80') },
        payee: { balance: MONEY('30') },
      },
    });
    expect(result.transitions).toHaveLength(2);
    expect(result.validatedReferences).toContain('FACT.RIGHT.LICENCE.1');
    assertInternationalExecutorBReplayEvidence(result.replayProof, [
      licensee,
      licensor,
      execution,
    ]);

    expect(() =>
      calculateTechnologyLicencePreparation({
        trace: TRACE,
        licensorCashFact: licensor,
        licenseeCashFact: licensee,
        executionFact: fact('FACT.EXECUTION.LICENCE.BAD', {
          ...execution.payload,
          executionRef: 'EXECUTION.LICENCE.BAD',
          amount: MONEY('101'),
        }),
      }),
    ).toThrow('insufficient');
  });

  it('conserves multi-party joint-project funding and exact ownership shares', () => {
    const participantA = cash(
      'FACT.CASH.PROJECT.A',
      'ACCOUNT.PROJECT.A',
      'COUNTRY.A',
      '60',
    );
    const participantB = cash(
      'FACT.CASH.PROJECT.B',
      'ACCOUNT.PROJECT.B',
      'COUNTRY.B',
      '60',
    );
    const project = cash(
      'FACT.CASH.PROJECT.POOL',
      'ACCOUNT.PROJECT.POOL',
      'PROJECT.JOINT.1',
      '0',
    );
    const execution = fact<JointProjectExecution>('FACT.EXECUTION.PROJECT', {
      executionRef: 'EXECUTION.PROJECT.1',
      contractRef: 'CONTRACT.PROJECT.1',
      activityType: 'Joint International Project',
      projectRef: 'PROJECT.JOINT.1',
      projectAccountRef: 'ACCOUNT.PROJECT.POOL',
      totalCost: MONEY('100'),
      contributions: [
        {
          participantRef: 'COUNTRY.A',
          participantAccountRef: 'ACCOUNT.PROJECT.A',
          contribution: MONEY('40'),
          ownershipShare: { amount: '0.4', unit: 'ratio' },
          contributionFactRef: 'FACT.CONTRIBUTION.A',
        },
        {
          participantRef: 'COUNTRY.B',
          participantAccountRef: 'ACCOUNT.PROJECT.B',
          contribution: MONEY('60'),
          ownershipShare: { amount: '0.6', unit: 'ratio' },
          contributionFactRef: 'FACT.CONTRIBUTION.B',
        },
      ],
      executedAt: TRACE.snapshotAt,
    });
    const result = calculateJointProjectPreparation({
      trace: TRACE,
      participantCashFacts: [participantA, participantB],
      projectCashFact: project,
      executionFact: execution,
    });
    expect(result.output).toMatchObject({
      participants: [{ balance: MONEY('20') }, { balance: MONEY('0') }],
      project: { balance: MONEY('100') },
    });
    expect(result.transitions).toHaveLength(3);

    expect(() =>
      calculateJointProjectPreparation({
        trace: TRACE,
        participantCashFacts: [participantA, participantB],
        projectCashFact: project,
        executionFact: fact('FACT.EXECUTION.PROJECT.BAD_SHARE', {
          ...execution.payload,
          executionRef: 'EXECUTION.PROJECT.BAD_SHARE',
          contributions: [
            execution.payload.contributions[0]!,
            {
              ...execution.payload.contributions[1]!,
              ownershipShare: { amount: '0.5', unit: 'ratio' as const },
            },
          ],
        }),
      }),
    ).toThrow('sum exactly to one');

    const sharedParticipant = cash(
      'FACT.CASH.PROJECT.SHARED.PARTICIPANT',
      'ACCOUNT.PROJECT.SHARED',
      'COUNTRY.A',
      '100',
    );
    const sharedProject = cash(
      'FACT.CASH.PROJECT.SHARED.RECEIVER',
      'ACCOUNT.PROJECT.SHARED',
      'COUNTRY.A',
      '100',
    );
    expect(() =>
      calculateJointProjectPreparation({
        trace: TRACE,
        participantCashFacts: [sharedParticipant, participantB],
        projectCashFact: sharedProject,
        executionFact: fact('FACT.EXECUTION.PROJECT.SHARED', {
          ...execution.payload,
          executionRef: 'EXECUTION.PROJECT.SHARED',
          projectAccountRef: 'ACCOUNT.PROJECT.SHARED',
          contributions: [
            {
              ...execution.payload.contributions[0]!,
              participantAccountRef: 'ACCOUNT.PROJECT.SHARED',
            },
            execution.payload.contributions[1]!,
          ],
        }),
      }),
    ).toThrow('must differ from every participant account');
  });

  it('validates distinct PTA, FTA, customs, sector and multilateral treaty schemas', () => {
    const requests = [
      treaty('Preferential Trade Agreement', 'PTA', {
        tariffScheduleRefs: ['FACT.TARIFF.PTA'],
        customsRuleRefs: ['FACT.CUSTOMS.PTA'],
      }),
      treaty('Free Trade Agreement', 'FTA', {
        tariffScheduleRefs: ['FACT.TARIFF.FTA'],
        quotaScheduleRefs: ['FACT.QUOTA.FTA'],
        rulesOfOriginRefs: ['FACT.ORIGIN.FTA'],
        marketAccessRefs: ['FACT.ACCESS.FTA'],
        disputeMechanismRef: 'FACT.DISPUTE.FTA',
      }),
      treaty('Customs Cooperation Agreement', 'CUSTOMS', {
        customsRuleRefs: ['FACT.CUSTOMS.COOPERATION'],
      }),
      treaty('Sector Market Access Agreement', 'SECTOR', {
        sectorRefs: ['SECTOR.ENERGY'],
        marketAccessRefs: ['FACT.ACCESS.ENERGY'],
      }),
      treaty('Multilateral Economic Agreement', 'MULTI', {
        partyRefs: ['COUNTRY.A', 'COUNTRY.B', 'COUNTRY.C'],
        tariffScheduleRefs: ['FACT.TARIFF.MULTI'],
      }),
    ];
    expect(
      requests.map(
        (requestFact) =>
          validateTreatyPreparation({ trace: TRACE, requestFact }).activityType,
      ),
    ).toEqual([
      'Preferential Trade Agreement',
      'Free Trade Agreement',
      'Customs Cooperation Agreement',
      'Sector Market Access Agreement',
      'Multilateral Economic Agreement',
    ]);
    expect(() =>
      validateTreatyPreparation({
        trace: TRACE,
        requestFact: treaty('Free Trade Agreement', 'FTA.BAD', {
          tariffScheduleRefs: ['FACT.TARIFF.BAD'],
        }),
      }),
    ).toThrow('FTA requires');
  });

  it('calculates both reserve-swap currency legs without netting currencies', () => {
    const aUsd = cash(
      'FACT.RESERVE.A.USD',
      'RESERVE.A.USD',
      'COUNTRY.A',
      '100',
      'USD',
    );
    const aEur = cash(
      'FACT.RESERVE.A.EUR',
      'RESERVE.A.EUR',
      'COUNTRY.A',
      '0',
      'EUR',
    );
    const bUsd = cash(
      'FACT.RESERVE.B.USD',
      'RESERVE.B.USD',
      'COUNTRY.B',
      '0',
      'USD',
    );
    const bEur = cash(
      'FACT.RESERVE.B.EUR',
      'RESERVE.B.EUR',
      'COUNTRY.B',
      '80',
      'EUR',
    );
    const execution = fact<ReserveSwapExecution>('FACT.EXECUTION.SWAP', {
      executionRef: 'EXECUTION.SWAP.1',
      contractRef: 'CONTRACT.SWAP.1',
      activityType: 'Reserve Swap',
      partyARef: 'COUNTRY.A',
      partyBRef: 'COUNTRY.B',
      partyACurrencyAAccountRef: 'RESERVE.A.USD',
      partyACurrencyBAccountRef: 'RESERVE.A.EUR',
      partyBCurrencyAAccountRef: 'RESERVE.B.USD',
      partyBCurrencyBAccountRef: 'RESERVE.B.EUR',
      principalA: MONEY('50', 'USD'),
      principalB: MONEY('40', 'EUR'),
      partyAReceivableFactRef: 'FACT.CLAIM.A.RECEIVABLE',
      partyAPayableFactRef: 'FACT.CLAIM.A.PAYABLE',
      partyBReceivableFactRef: 'FACT.CLAIM.B.RECEIVABLE',
      partyBPayableFactRef: 'FACT.CLAIM.B.PAYABLE',
      termsFactRef: 'FACT.SWAP.TERMS',
      executedAt: TRACE.snapshotAt,
    });
    const result = calculateReserveSwapPreparation({
      trace: TRACE,
      partyACurrencyAFact: aUsd,
      partyACurrencyBFact: aEur,
      partyBCurrencyAFact: bUsd,
      partyBCurrencyBFact: bEur,
      executionFact: execution,
    });
    expect(result.output).toMatchObject({
      partyACurrencyA: { balance: MONEY('50', 'USD') },
      partyACurrencyB: { balance: MONEY('40', 'EUR') },
      partyBCurrencyA: { balance: MONEY('50', 'USD') },
      partyBCurrencyB: { balance: MONEY('40', 'EUR') },
    });
    expect(result.transitions).toHaveLength(4);
  });

  it('validates concrete sanctions and rejects prohibited abstract intensity', () => {
    const request = fact<SanctionPackageValidationRequest>(
      'FACT.SANCTION.VALIDATION',
      {
        validationRef: 'VALIDATION.SANCTION.1',
        contractRef: 'CONTRACT.SANCTION.1',
        activityType: 'Sanction Package',
        imposingPartyRefs: ['COUNTRY.A'],
        targetCountryRef: 'COUNTRY.B',
        measures: ['GOODS_IMPORT_BAN', 'TECHNOLOGY_LICENCE_BAN'],
        targetRefs: ['COMMODITY.OIL', 'TECHNOLOGY.AI'],
        exemptionRefs: ['EXEMPTION.HUMANITARIAN'],
        requiredApprovalFactRefs: [
          'FACT.APPROVAL.TRADE',
          'FACT.APPROVAL.CAPTAIN',
        ],
        startAt: TRACE.snapshotAt,
        endConditionFactRef: 'FACT.END_CONDITION.SANCTION',
        grandfatherExistingContracts: true,
      },
    );
    const result = validateSanctionPackagePreparation({
      trace: TRACE,
      requestFact: request,
    });
    expect(result.transitions).toEqual([]);
    expect(result.output).toMatchObject({
      measures: ['GOODS_IMPORT_BAN', 'TECHNOLOGY_LICENCE_BAN'],
    });
    expect(() =>
      validateSanctionPackagePreparation({
        trace: TRACE,
        requestFact: fact('FACT.SANCTION.INTENSITY', {
          ...request.payload,
          validationRef: 'VALIDATION.SANCTION.INTENSITY',
          intensity: '80',
        } as never),
      }),
    ).toThrow('must not contain abstract intensity');
  });

  it('moves commodity aid inventory exactly and never synthesizes stock', () => {
    const donor = fact<InventoryAccountSnapshot>('FACT.INVENTORY.DONOR', {
      accountRef: 'INVENTORY.DONOR.WHEAT',
      ownerRef: 'COUNTRY.A',
      commodityRef: 'COMMODITY.WHEAT',
      available: Q('10', 'tonne'),
    });
    const recipient = fact<InventoryAccountSnapshot>(
      'FACT.INVENTORY.RECIPIENT',
      {
        accountRef: 'INVENTORY.RECIPIENT.WHEAT',
        ownerRef: 'COUNTRY.B',
        commodityRef: 'COMMODITY.WHEAT',
        available: Q('2', 'tonne'),
      },
    );
    const execution = fact<CommodityAidExecution>(
      'FACT.EXECUTION.COMMODITY_AID',
      {
        executionRef: 'EXECUTION.COMMODITY_AID.1',
        contractRef: 'CONTRACT.COMMODITY_AID.1',
        activityType: 'Commodity Aid',
        donorRef: 'COUNTRY.A',
        recipientRef: 'COUNTRY.B',
        donorAccountRef: 'INVENTORY.DONOR.WHEAT',
        recipientAccountRef: 'INVENTORY.RECIPIENT.WHEAT',
        commodityRef: 'COMMODITY.WHEAT',
        quantity: Q('4', 'tonne'),
        deliveryFactRef: 'FACT.DELIVERY.AID.1',
        executedAt: TRACE.snapshotAt,
      },
    );
    const result = calculateCommodityAidPreparation({
      trace: TRACE,
      donorInventoryFact: donor,
      recipientInventoryFact: recipient,
      executionFact: execution,
    });
    expect(result.output).toMatchObject({
      donor: { available: Q('6', 'tonne') },
      recipient: { available: Q('6', 'tonne') },
    });
    expect(() =>
      calculateCommodityAidPreparation({
        trace: TRACE,
        donorInventoryFact: donor,
        recipientInventoryFact: recipient,
        executionFact: fact('FACT.EXECUTION.COMMODITY_AID.BAD', {
          ...execution.payload,
          executionRef: 'EXECUTION.COMMODITY_AID.BAD',
          quantity: Q('11', 'tonne'),
        }),
      }),
    ).toThrow('insufficient');
  });

  it('creates reconciled concessional-loan cash and debt transitions', () => {
    const lenderCash = cash(
      'FACT.LOAN.LENDER.CASH',
      'ACCOUNT.LOAN.LENDER',
      'COUNTRY.A',
      '100',
    );
    const borrowerCash = cash(
      'FACT.LOAN.BORROWER.CASH',
      'ACCOUNT.LOAN.BORROWER',
      'COUNTRY.B',
      '0',
    );
    const receivable = fact<DebtPositionSnapshot>('FACT.LOAN.RECEIVABLE', {
      positionRef: 'POSITION.LOAN.RECEIVABLE',
      ownerRef: 'COUNTRY.A',
      counterpartyRef: 'COUNTRY.B',
      side: 'RECEIVABLE',
      principal: MONEY('0'),
    });
    const payable = fact<DebtPositionSnapshot>('FACT.LOAN.PAYABLE', {
      positionRef: 'POSITION.LOAN.PAYABLE',
      ownerRef: 'COUNTRY.B',
      counterpartyRef: 'COUNTRY.A',
      side: 'PAYABLE',
      principal: MONEY('0'),
    });
    const execution = fact<EmergencyConcessionalLoanExecution>(
      'FACT.EXECUTION.LOAN',
      {
        executionRef: 'EXECUTION.LOAN.1',
        contractRef: 'CONTRACT.LOAN.1',
        activityType: 'Emergency Concessional Loan',
        lenderRef: 'COUNTRY.A',
        borrowerRef: 'COUNTRY.B',
        lenderCashAccountRef: 'ACCOUNT.LOAN.LENDER',
        borrowerCashAccountRef: 'ACCOUNT.LOAN.BORROWER',
        lenderReceivableRef: 'POSITION.LOAN.RECEIVABLE',
        borrowerPayableRef: 'POSITION.LOAN.PAYABLE',
        principal: MONEY('20'),
        concessionalTermsFactRef: 'FACT.LOAN.TERMS',
        executedAt: TRACE.snapshotAt,
      },
    );
    const result = calculateEmergencyConcessionalLoanPreparation({
      trace: TRACE,
      lenderCashFact: lenderCash,
      borrowerCashFact: borrowerCash,
      lenderReceivableFact: receivable,
      borrowerPayableFact: payable,
      executionFact: execution,
    });
    expect(result.output).toMatchObject({
      lenderCash: { balance: MONEY('80') },
      borrowerCash: { balance: MONEY('20') },
      lenderReceivable: { principal: MONEY('20') },
      borrowerPayable: { principal: MONEY('20') },
    });
    expect(result.transitions).toHaveLength(4);
  });

  it('consumes provider capacity and records matching technical assistance', () => {
    const provider = fact<ServiceCapacitySnapshot>('FACT.SERVICE.CAPACITY', {
      capacityRef: 'CAPACITY.TECHNICAL.1',
      ownerRef: 'COUNTRY.A',
      serviceRef: 'SERVICE.ENGINEERING',
      available: Q('8', 'person_hour'),
    });
    const recipient = fact<ServiceReceiptSnapshot>('FACT.SERVICE.RECEIPT', {
      receiptRef: 'RECEIPT.TECHNICAL.1',
      ownerRef: 'COUNTRY.B',
      serviceRef: 'SERVICE.ENGINEERING',
      delivered: Q('2', 'person_hour'),
    });
    const execution = fact<TechnicalAssistanceExecution>(
      'FACT.EXECUTION.ASSISTANCE',
      {
        executionRef: 'EXECUTION.ASSISTANCE.1',
        contractRef: 'CONTRACT.ASSISTANCE.1',
        activityType: 'Technical Assistance',
        providerRef: 'COUNTRY.A',
        recipientRef: 'COUNTRY.B',
        providerCapacityRef: 'CAPACITY.TECHNICAL.1',
        recipientReceiptRef: 'RECEIPT.TECHNICAL.1',
        serviceRef: 'SERVICE.ENGINEERING',
        delivered: Q('3', 'person_hour'),
        serviceRightFactRef: 'FACT.RIGHT.SERVICE.1',
        executedAt: TRACE.snapshotAt,
      },
    );
    const result = calculateTechnicalAssistancePreparation({
      trace: TRACE,
      providerCapacityFact: provider,
      recipientReceiptFact: recipient,
      executionFact: execution,
    });
    expect(result.output).toMatchObject({
      provider: { available: Q('5', 'person_hour') },
      recipient: { delivered: Q('5', 'person_hour') },
    });
  });

  it('validates tender allocations and partnership components without economic buffs', () => {
    const tender = fact<InternationalTenderValidationRequest>(
      'FACT.TENDER.VALIDATION',
      {
        validationRef: 'VALIDATION.TENDER.1',
        contractRef: 'CONTRACT.TENDER.1',
        activityType: 'International Tender',
        tenderRef: 'TENDER.1',
        requestingCountryRef: 'COUNTRY.A',
        needFactRef: 'FACT.NEED.TENDER',
        required: Q('10', 'tonne'),
        maximumUnitPrice: MONEY('5'),
        partialAwardAllowed: false,
        bids: [
          {
            bidRef: 'BID.1',
            bidderRef: 'COUNTRY.B',
            offered: Q('6', 'tonne'),
            unitPrice: MONEY('4'),
            reliabilityFactRef: 'FACT.RELIABILITY.B',
            technologyFactRef: 'FACT.TECHNOLOGY.B',
          },
          {
            bidRef: 'BID.2',
            bidderRef: 'COUNTRY.C',
            offered: Q('4', 'tonne'),
            unitPrice: MONEY('5'),
            reliabilityFactRef: 'FACT.RELIABILITY.C',
            technologyFactRef: 'FACT.TECHNOLOGY.C',
          },
        ],
        awards: [
          { awardRef: 'AWARD.1', bidRef: 'BID.1', awarded: Q('6', 'tonne') },
          { awardRef: 'AWARD.2', bidRef: 'BID.2', awarded: Q('4', 'tonne') },
        ],
        evaluationRuleFactRef: 'FACT.EVALUATION.TENDER',
        evaluatedAt: TRACE.snapshotAt,
      },
    );
    const tenderResult = validateInternationalTenderPreparation({
      trace: TRACE,
      requestFact: tender,
    });
    expect(tenderResult.output).toMatchObject({
      totalAwarded: Q('10', 'tonne'),
    });
    expect(tenderResult.transitions).toEqual([]);
    expect(() =>
      validateInternationalTenderPreparation({
        trace: TRACE,
        requestFact: fact('FACT.TENDER.PARTIAL_FORBIDDEN', {
          ...tender.payload,
          validationRef: 'VALIDATION.TENDER.PARTIAL_FORBIDDEN',
          awards: [tender.payload.awards[0]!],
        }),
      }),
    ).toThrow('partial-award rule');

    const partnership = fact<StrategicPartnershipValidationRequest>(
      'FACT.PARTNERSHIP.VALIDATION',
      {
        validationRef: 'VALIDATION.PARTNERSHIP.1',
        contractRef: 'CONTRACT.PARTNERSHIP.1',
        activityType: 'Strategic Economic Partnership',
        partnerRefs: ['COUNTRY.A', 'COUNTRY.B'],
        strategicScopeRefs: ['SCOPE.TECHNOLOGY', 'SCOPE.TRADE'],
        componentAgreementRefs: ['CONTRACT.LICENCE.1', 'CONTRACT.FTA.1'],
        governanceFactRef: 'FACT.GOVERNANCE.PARTNERSHIP',
        captainApprovalFactRef: 'FACT.APPROVAL.CAPTAIN.PARTNERSHIP',
        reviewedAt: TRACE.snapshotAt,
      },
    );
    expect(
      validateStrategicPartnershipPreparation({
        trace: TRACE,
        requestFact: partnership,
      }).output,
    ).toMatchObject({
      componentAgreementRefs: ['CONTRACT.LICENCE.1', 'CONTRACT.FTA.1'],
    });
    expect(() =>
      validateStrategicPartnershipPreparation({
        trace: TRACE,
        requestFact: fact('FACT.PARTNERSHIP.BUFF', {
          ...partnership.payload,
          validationRef: 'VALIDATION.PARTNERSHIP.BUFF',
          buff: '10',
        } as never),
      }),
    ).toThrow('abstract buff');
  });

  it('keeps grant, reconstruction and dispute compensation as distinct subtype evidence', () => {
    const makeAccounts = (sequence: string) => ({
      payer: cash(
        `FACT.CASH.${sequence}.PAYER`,
        `ACCOUNT.${sequence}.PAYER`,
        'COUNTRY.A',
        '50',
      ),
      payee: cash(
        `FACT.CASH.${sequence}.PAYEE`,
        `ACCOUNT.${sequence}.PAYEE`,
        'COUNTRY.B',
        '0',
      ),
    });
    const grantAccounts = makeAccounts('GRANT');
    const grant = calculateGrantAidPreparation({
      trace: TRACE,
      donorCashFact: grantAccounts.payer,
      recipientCashFact: grantAccounts.payee,
      executionFact: fact<GrantAidExecution>('FACT.EXECUTION.GRANT', {
        executionRef: 'EXECUTION.GRANT.1',
        contractRef: 'CONTRACT.GRANT.1',
        activityType: 'Grant Aid',
        payerAccountRef: 'ACCOUNT.GRANT.PAYER',
        payeeAccountRef: 'ACCOUNT.GRANT.PAYEE',
        amount: MONEY('10'),
        purposeFactRef: 'FACT.PURPOSE.GRANT',
        executedAt: TRACE.snapshotAt,
        donorRef: 'COUNTRY.A',
        recipientRef: 'COUNTRY.B',
        grantTermsFactRef: 'FACT.TERMS.GRANT',
      }),
    });
    const reconstructionAccounts = makeAccounts('RECONSTRUCTION');
    const reconstruction = calculateProjectReconstructionAidPreparation({
      trace: TRACE,
      donorCashFact: reconstructionAccounts.payer,
      recipientCashFact: reconstructionAccounts.payee,
      executionFact: fact<ProjectReconstructionAidExecution>(
        'FACT.EXECUTION.RECONSTRUCTION',
        {
          executionRef: 'EXECUTION.RECONSTRUCTION.1',
          contractRef: 'CONTRACT.RECONSTRUCTION.1',
          activityType: 'Project Reconstruction Aid',
          payerAccountRef: 'ACCOUNT.RECONSTRUCTION.PAYER',
          payeeAccountRef: 'ACCOUNT.RECONSTRUCTION.PAYEE',
          amount: MONEY('12'),
          purposeFactRef: 'FACT.PURPOSE.RECONSTRUCTION',
          executedAt: TRACE.snapshotAt,
          donorRef: 'COUNTRY.A',
          recipientRef: 'COUNTRY.B',
          projectRef: 'PROJECT.RECONSTRUCTION.1',
          useConstraintFactRef: 'FACT.CONSTRAINT.RECONSTRUCTION',
        },
      ),
    });
    const disputeAccounts = makeAccounts('DISPUTE');
    const dispute = calculateTradeDisputeCompensationPreparation({
      trace: TRACE,
      payerCashFact: disputeAccounts.payer,
      injuredPartyCashFact: disputeAccounts.payee,
      executionFact: fact<TradeDisputeCompensationExecution>(
        'FACT.EXECUTION.DISPUTE',
        {
          executionRef: 'EXECUTION.DISPUTE.1',
          contractRef: 'CONTRACT.DISPUTE.1',
          activityType: 'Trade Dispute Settlement',
          payerAccountRef: 'ACCOUNT.DISPUTE.PAYER',
          payeeAccountRef: 'ACCOUNT.DISPUTE.PAYEE',
          amount: MONEY('8'),
          purposeFactRef: 'FACT.PURPOSE.DISPUTE',
          executedAt: TRACE.snapshotAt,
          disputeRef: 'DISPUTE.1',
          settlementFactRef: 'FACT.SETTLEMENT.DISPUTE',
          remedy: 'COMPENSATION_PAYMENT',
        },
      ),
    });
    expect([
      grant.replayProof.module,
      reconstruction.replayProof.module,
      dispute.replayProof.module,
    ]).toEqual([
      'V22_3_GRANT_AID',
      'V22_3_RECONSTRUCTION_AID',
      'V22_3_DISPUTE_COMPENSATION',
    ]);
    expect([
      grant.output.payee.balance.amount,
      reconstruction.output.payee.balance.amount,
      dispute.output.payee.balance.amount,
    ]).toEqual(['10', '12', '8']);
  });

  it('rejects tampered payloads and mixed lineage in replay inputs', () => {
    const donor = cash(
      'FACT.REPLAY.DONOR',
      'ACCOUNT.REPLAY.DONOR',
      'COUNTRY.A',
      '20',
    );
    const recipient = cash(
      'FACT.REPLAY.RECIPIENT',
      'ACCOUNT.REPLAY.RECIPIENT',
      'COUNTRY.B',
      '0',
    );
    const execution = fact<GrantAidExecution>('FACT.REPLAY.EXECUTION', {
      executionRef: 'EXECUTION.REPLAY.1',
      contractRef: 'CONTRACT.REPLAY.1',
      activityType: 'Grant Aid',
      payerAccountRef: 'ACCOUNT.REPLAY.DONOR',
      payeeAccountRef: 'ACCOUNT.REPLAY.RECIPIENT',
      amount: MONEY('5'),
      purposeFactRef: 'FACT.PURPOSE.REPLAY',
      executedAt: TRACE.snapshotAt,
      donorRef: 'COUNTRY.A',
      recipientRef: 'COUNTRY.B',
      grantTermsFactRef: 'FACT.TERMS.REPLAY',
    });
    const result = calculateGrantAidPreparation({
      trace: TRACE,
      donorCashFact: donor,
      recipientCashFact: recipient,
      executionFact: execution,
    });
    const forgedBody: Record<string, unknown> = {
      ...result.replayProof,
      outputCanonical: '{"forged":true}',
    };
    delete forgedBody.hashInput;
    const forgedProof = {
      ...result.replayProof,
      outputCanonical: '{"forged":true}',
      hashInput: canonicalHashInput(forgedBody),
    };
    expect(() =>
      assertInternationalExecutorBReplayEvidence(forgedProof, [
        donor,
        recipient,
        execution,
      ]),
    ).toThrow('recomputed subtype economics');
    expect(() =>
      assertInternationalExecutorBReplayEvidence(result.replayProof, [
        donor,
        recipient,
        { ...execution, payload: { ...execution.payload, amount: MONEY('6') } },
      ]),
    ).toThrow('canonical payload');

    const staleTrace: FoundationTraceRequest = {
      ...TRACE,
      snapshot: {
        ...TRACE.snapshot,
        sourceVersion: 'WORLD.VERSION.22.2',
        snapshotHash: 'c'.repeat(64),
      },
    };
    expect(() =>
      calculateGrantAidPreparation({
        trace: TRACE,
        donorCashFact: donor,
        recipientCashFact: recipient,
        executionFact: fact('FACT.REPLAY.STALE', execution.payload, staleTrace),
      }),
    ).toThrow('mixed lineage/version/snapshot evidence');
  });
});
