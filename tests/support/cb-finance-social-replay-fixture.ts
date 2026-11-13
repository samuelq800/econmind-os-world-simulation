/** Single-currency complete OMO register + genuine Core H0 ledger. All prices,
 * instruments, source/policy originals are TEST_ONLY, not cfc or admission. */
import * as C from '../../packages/core/src/index.js';
import { canonicalSerialize as distSerialize } from '@econmind/core';
import { centralBankTestOnlyFixture } from './g-dispatch-cb-test-only-fixture.js';
import {
  mixedSocialOriginal,
  withMixedTestProof,
  mixedWorld as world,
  mixedSha as sha,
} from './finance-social-fx-replay-fixture.js';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialFxLedger,
} from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
import {
  prepareFinanceNativeBudgetTransition,
  type FinanceSocialOmoOriginal,
  type FinanceNativeBudgetCanonicalFrame,
  type FinanceNativeBudgetSource,
  type FinanceNativeBudgetPolicy,
} from '../../packages/core/src/commands/finance-budget-native.js';
export function createCbFinanceSocialFixture(
  options: { readonly runtimeOpening?: boolean } = {},
) {
  const at = options.runtimeOpening
    ? '2026-10-07T00:00:00.000Z'
    : '2026-10-29T00:00:00.000Z';
  const legacy = centralBankTestOnlyFixture();
  const map = (value: unknown): unknown => {
    if (typeof value === 'string')
      return (
        (
          {
            WORLD_TEST_ONLY_CB1: world,
            COUNTRY_TEST_ONLY_CB1: 'COUNTRY_01',
            ENTITY_TEST_ONLY_TREASURY: 'ENTITY_GOVERNMENT_01',
            ENTITY_TEST_ONLY_CB: 'ENTITY_CENTRAL_BANK_01',
            ENTITY_TEST_ONLY_BANK: 'ENTITY_BANK_01',
            GBP: 'XAA',
          } as Record<string, string>
        )[value] ?? value
      );
    if (Array.isArray(value)) return value.map(map);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, map(v)]),
      );
    return value;
  };
  const transformedRaw = map(JSON.parse(distSerialize(legacy.seed))) as Record<
    string,
    unknown
  >;
  const { fingerprint: _oldFingerprint, ...transformedIntent } = transformedRaw;
  void _oldFingerprint;
  const transformed = C.parseOpeningSeed(
    {
      ...transformedIntent,
      fingerprint: C.canonicalSha256(
        C.canonicalHashInput(transformedIntent),
        sha,
      ),
    },
    sha,
  );
  const facts = map(
    legacy.preparation.source.facts,
  ) as C.CentralBankOmoSourceFacts;
  const gov = C.legalEntityId(facts.domesticTreasuryRef),
    cb = C.legalEntityId(facts.centralBank.centralBankRef),
    country = C.countryId('COUNTRY_01');
  const claim = C.financialClaimId('CLAIM_TEST_ONLY_OMO_MIXED_TGA');
  const tga = C.createFinancialAccount({
    worldId: world,
    countryId: country,
    ownerId: gov,
    accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_OMO_TGA'),
    accountClass: 'ASSET',
    currency: 'XAA',
    claimId: claim,
    counterpartyEntityId: cb,
  });
  const govEquity = C.createFinancialAccount({
    ...tga,
    accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_OMO_GOV_EQUITY'),
    accountClass: 'EQUITY',
    claimId: null,
    counterpartyEntityId: null,
  });
  const governmentLeg = C.financialOpeningLegId('LEG_TEST_ONLY_OMO_TGA'),
    equityLeg = C.financialOpeningLegId('LEG_TEST_ONLY_OMO_GOV_EQUITY');
  let mirrorLeg: C.FinancialOpeningLegId | undefined;
  const batches = transformed.financialBatches.map((batch) => ({
    ...batch,
    legs: batch.legs.map((leg) => {
      if (leg.account.accountId !== facts.centralBankAccounts.treasuryDeposits)
        return leg;
      mirrorLeg = leg.legId;
      return {
        ...leg,
        account: C.createFinancialAccount({
          ...leg.account,
          claimId: claim,
          counterpartyEntityId: gov,
        }),
        counterpartLegId: governmentLeg,
      };
    }),
  }));
  if (!mirrorLeg) throw Error('actual source TGA liability required');
  const batch = batches[0]!;
  batch.legs.push(
    {
      legId: governmentLeg,
      account: tga,
      direction: 'DEBIT',
      amount: C.Money.from('5', 'XAA'),
      counterpartLegId: mirrorLeg,
    },
    {
      legId: equityLeg,
      account: govEquity,
      direction: 'CREDIT',
      amount: C.Money.from('5', 'XAA'),
      counterpartLegId: governmentLeg,
    },
  );
  const { fingerprint: _fp, ...seedIntent } = transformed;
  void _fp;
  const seed = C.createOpeningSeed(
      {
        ...seedIntent,
        financialBatches: batches,
        ...(options.runtimeOpening
          ? {
              sources: [
                C.createOpeningSource(
                  {
                    schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
                    sourceId: transformed.sources[0]!.sourceId,
                    sourceKind: 'DOCUMENTED_ASSUMPTION',
                    sourceVersion: 'TEST_ONLY_CB_MIXED_RUNTIME_V1',
                    locator: 'fixture://TEST_ONLY_CB_MIXED_RUNTIME',
                    payload: {
                      notice:
                        'TEST_ONLY one-currency OMO/TGA register, not postwar adoption',
                    },
                  },
                  sha,
                ),
              ],
            }
          : {}),
      },
      sha,
    ),
    financial = C.rebuildV08LedgersFromLineage({
      seed,
      sha256Hex: sha,
    }).financial;
  const quotes = Array.from({ length: 20 }, (_, i) => ({
    ...facts.quote,
    quoteRef: `QUOTE_OMO_MIXED_TEST_${i}`,
    worldVersion: String(i),
    validAtSimTime: '1',
  }));
  const original: FinanceSocialOmoOriginal = {
    countryId: 'COUNTRY_01',
    domesticTreasuryRef: facts.domesticTreasuryRef,
    bank: facts.bank,
    centralBank: facts.centralBank,
    bankAccounts: facts.bankAccounts,
    centralBankAccounts: facts.centralBankAccounts,
    holdings: facts.holdings,
    quotes,
  };
  const social = mixedSocialOriginal(),
    prepared = prepareFinanceSocialLedger(financial);
  const replay = (
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
    omoOriginals: readonly FinanceSocialOmoOriginal[] = [original],
  ) =>
    replayPreparedFinanceSocialFxLedger({
      prepared,
      frames,
      socialCountries: [social],
      fxOriginals: [],
      omoOriginals,
      openingEncumbrances: [],
      expectedHead: {
        worldVersion: frames.at(-1)?.transition.worldVersionAfter ?? '0',
        eventSequence: frames.at(-1)?.events.at(-1)?.sequence ?? '0',
      },
      sha256Hex: sha,
    });
  const policy: FinanceNativeBudgetPolicy = {
    schemaVersion: 'finance-native-budget-policy-v1',
    ruleRef: 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1',
    ruleRevision: 'TEST_ONLY_RULE',
    sourceDocumentSHA256: 'sha256:' + 'a'.repeat(64),
    normativeUnits: [
      'FINANCE-U0247',
      'FINANCE-U0252',
      'FINANCE-U0265',
      'FINANCE-U0295',
    ],
    worldId: world,
    countryId: 'COUNTRY_01',
    governmentEntityId: gov,
    currency: 'XAA',
    envelopeRef: 'ENVELOPE_TEST_ONLY_OMO',
    effectivePeriodRef: 'PERIOD_TEST_ONLY_OMO',
    periodRevision: 'PERIOD_TEST_ONLY',
    validFromSimTime: '0',
    validUntilSimTime: '86400000',
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    requiredApprovalOffices: ['FINANCE'],
  };
  const budgetFrame = async (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
    identity: string,
    amount: string,
  ) => {
    const state = replay(frames),
      command = C.parseCanonicalCommand(
        {
          schemaVersion: C.COMMAND_SCHEMA_VERSION,
          worldId: world,
          countryId: 'COUNTRY_01',
          officeId: 'FINANCE',
          actorId: 'ACTOR_TEST_ONLY_MIXED',
          authSubject: '11111111-1111-4111-8111-111111111111',
          commandId: `COMMAND_OMO_BUDGET_${identity}`,
          idempotencyKey: `KEY_OMO_BUDGET_${identity}`,
          commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
          expectedWorldVersion: state.budgetState.worldVersion,
          simTime: '1',
          correlationId: 'CORRELATION_OMO_BUDGET',
          submittedAtReal: at,
          payload: {
            operation,
            scope: {
              worldId: world,
              countryId: 'COUNTRY_01',
              entityRef: gov,
              envelopeRef: policy.envelopeRef,
              effectivePeriodRef: policy.effectivePeriodRef,
            },
            currency: 'XAA',
            amount,
            envelopeRevisionRef: 'ENVELOPE_REV_OMO',
            lineRef:
              operation === 'SET_ENVELOPE' ? null : `LINE_OMO_${identity}`,
            revisionRef:
              operation === 'SET_ENVELOPE'
                ? 'ENVELOPE_REV_OMO'
                : `LINE_REV_OMO_${identity}`,
            predecessorRevisionRef: null,
          },
        },
        sha,
      );
    const source: FinanceNativeBudgetSource = {
      policy,
      binding: {
        seedRef: seed.seedId,
        seedFingerprint: seed.fingerprint,
        admissionRef: 'TEST_ONLY_ADMISSION',
        financialSourceId: seed.sources[0]!.sourceId,
        originalsSHA256: 'sha256:' + 'b'.repeat(64),
        policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
        treasuryAccountId: tga.accountId,
        treasuryClaimId: claim,
        openingEncumbranceHash: C.canonicalSha256(
          C.canonicalHashInput([]),
          sha,
        ),
      },
      openingEncumbrances: [],
      financialState: state.financial,
      mixedPrefixEvidence: state.mixedPrefixEvidence,
      frames,
      worldVersion: state.budgetState.worldVersion,
      eventSequence: state.budgetState.eventSequence,
    };
    const value = await withMixedTestProof(command, 'FINANCE_BUDGET', (proof) =>
      prepareFinanceNativeBudgetTransition({
        command,
        authorization: proof,
        source,
        recordedAtReal: at,
        sha256Hex: sha,
      }),
    );
    return {
      command,
      transition: value.transition,
      events: value.transition.events,
      receipt: value.receipt,
      financialPostingBatches: [],
      inventoryPostings: [],
    };
  };
  const omoFrame = (
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
    identity: string,
    direction: C.CentralBankOmoIntent['direction'] = 'BUY_GOVERNMENT_SECURITIES',
  ) => {
    const state = replay(frames),
      version = state.budgetState.worldVersion,
      quote = quotes.find((q) => q.worldVersion === version)!;
    const command = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId: world,
        countryId: 'COUNTRY_01',
        officeId: 'CENTRAL_BANK',
        commandType: C.CENTRAL_BANK_OMO_COMMAND,
        actorId: 'ACTOR_TEST_ONLY_CB',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: `COMMAND_OMO_MIXED_${identity}`,
        idempotencyKey: `KEY_OMO_MIXED_${identity}`,
        expectedWorldVersion: version,
        simTime: '1',
        correlationId: 'CORRELATION_OMO_MIXED',
        submittedAtReal: at,
        payload: {
          schemaVersion: 'central-bank-omo-intent-v1',
          direction,
          securityRef: quote.securityRef,
          batchRef: quote.batchRef,
          faceValue: { amount: '1', currency: 'XAA' },
          settlementSimTime: '1',
          policyNote: null,
        },
      },
      sha,
    );
    const snapshot = <T extends object>(
      template: T,
      accounts: Readonly<Record<string, string>>,
    ): T => {
      const result = { ...template } as Record<string, unknown>;
      for (const [field, id] of Object.entries(accounts)) {
        const a = state.financial.accounts.find((a) => a.accountId === id)!,
          p = state.financial.positions.find((p) => p.account.accountId === id);
        result[field] = {
          amount: p
            ? (a.accountClass === 'LIABILITY' || a.accountClass === 'EQUITY'
                ? p.netDebitBalance.amount.negated()
                : p.netDebitBalance.amount
              ).toString()
            : '0',
          currency: a.currency,
        };
      }
      return result as T;
    };
    const current: C.CentralBankOmoSourceFacts = {
      worldId: world,
      countryId: 'COUNTRY_01',
      worldVersion: version,
      currentEventSequence: state.budgetState.eventSequence,
      currentSimTime: '1',
      domesticTreasuryRef: gov,
      bank: snapshot(original.bank, original.bankAccounts),
      centralBank: snapshot(original.centralBank, original.centralBankAccounts),
      bankAccounts: original.bankAccounts,
      centralBankAccounts: original.centralBankAccounts,
      holdings: state.omoCountries?.[0]?.holdings ?? original.holdings,
      quote,
    };
    const result = C.prepareCentralBankOmoTransition({
      command,
      source: {
        facts: current,
        financialState: state.financial,
        trace: {
          traceRef: 'TRACE_OMO_MIXED_TEST',
          calculationVersion: 'CB1.V1',
          snapshot: {
            lineageRef: 'ADOPTION_TEST_ONLY_OMO_MIXED',
            sourceVersion: `WORLD_VERSION.${version}`,
            snapshotRef: quote.sourceRef,
            snapshotHash: C.centralBankOmoSourceHash(current, sha),
            predecessorSnapshotHash: null,
          },
          snapshotAt: { amount: '1', unit: 'sim_millisecond' },
        },
      },
      eventId: `EVENT_${command.commandId}`,
      eventSequence: String(BigInt(state.budgetState.eventSequence) + 1n),
      financialBatchId: `BATCH_${command.commandId}`,
      observedAtReal: at,
      sha256Hex: sha,
    });
    return {
      command,
      events: [result.event],
      transition: result.transition,
      receipt: C.createFinalCommandReceipt({
        command,
        transition: result.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: command.simTime,
        recordedAtReal: at,
      }),
      financialPostingBatches: [result.posting],
      inventoryPostings: [],
    };
  };
  return {
    seed,
    financial,
    prepared,
    original,
    facts,
    social,
    tga,
    policy,
    replay,
    budgetFrame,
    omoFrame,
  };
}
