/** Real Core command calculations with TEST_ONLY policy/principals. No SQL,
 * native admission, registered capital/security source or runtime authority. */
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  type FinanceSocialReplayContinuation,
  type FinanceSocialReplayHead,
  type FinanceSocialReplayPage,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import {
  prepareFinanceNativeBudgetTransition,
  type FinanceNativeBudgetCanonicalFrame,
  type FinanceNativeBudgetPolicy,
  type FinanceNativeBudgetSource,
} from '../../packages/core/src/commands/finance-budget-native.js';
import {
  mixedFinancialFixture,
  mixedSocialOriginal,
  withMixedTestProof,
  mixedWorld as world,
  mixedSha as sha,
} from './finance-social-fx-replay-fixture.js';
const at = '2026-10-29T00:00:00.000Z';
export function createFinanceSocialContinuationFixture(
  options: {
    admissionRef?: string;
    captainCountries?: Parameters<
      typeof prepareFinanceSocialReplayContinuation
    >[0]['captainCountries'];
  } = {},
) {
  const f = mixedFinancialFixture(),
    social = mixedSocialOriginal(),
    opening = C.rebuildV08LedgersFromLineage({ seed: f.seed, sha256Hex: sha }),
    a = f.accounts,
    openingEncumbrances = [
      {
        reference: 'OPENING_TREASURY_TEST_ONLY',
        accountId: a.treasuryAsset.accountId,
        amount: '200',
        currency: 'XAA',
      },
      {
        reference: 'OPENING_BANK_TEST_ONLY',
        accountId: a.bankGcuAsset.accountId,
        amount: '10',
        currency: 'GCU',
      },
    ],
    fxOriginals = [
      {
        quote: f.quote,
        treasuryAsset: a.treasuryAsset,
        treasuryLiability: a.treasuryLiability,
        bankSettlementAsset: a.bankSettlementAsset,
        bankSettlementLiability: a.bankSettlementLiability,
        bankGcuAsset: a.bankGcuAsset,
      },
    ];
  const start = (expectedHead: FinanceSocialReplayHead) =>
    prepareFinanceSocialReplayContinuation(
      {
        opening,
        socialCountries: [social],
        openingEncumbrances,
        fxOriginals,
        ...(options.captainCountries
          ? { captainCountries: options.captainCountries }
          : {}),
        expectedHead,
      },
      sha,
    );
  const page = (
    continuation: FinanceSocialReplayContinuation,
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
  ): FinanceSocialReplayPage => {
    const prior = readFinanceSocialReplayContinuation(continuation);
    return {
      schemaVersion: 'finance-social-replay-page-v1',
      worldId: world,
      seedFingerprint: f.seed.fingerprint,
      fromHead: prior.head,
      throughHead: frames.length
        ? {
            worldVersion: frames.at(-1)!.transition.worldVersionAfter,
            eventSequence: frames.at(-1)!.events.at(-1)!.sequence,
          }
        : prior.head,
      expectedHead: prior.expectedHead,
      frames,
      framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
    };
  };
  const append = (
    continuation: FinanceSocialReplayContinuation,
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
  ) =>
    appendFinanceSocialReplayPage({
      continuation,
      page: page(continuation, frames),
      sha256Hex: sha,
    });
  const budget = async (
    continuation: FinanceSocialReplayContinuation,
    identity: string,
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE' = 'SET_ENVELOPE',
    envelopeIdentity = identity,
  ): Promise<FinanceNativeBudgetCanonicalFrame> => {
    const current = readFinanceSocialReplayContinuation(continuation),
      policy: FinanceNativeBudgetPolicy = {
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
        governmentEntityId: a.treasuryAsset.ownerId,
        currency: 'XAA',
        envelopeRef: 'ENVELOPE_PAGE_' + envelopeIdentity,
        effectivePeriodRef: 'PERIOD_TEST_ONLY',
        periodRevision: 'REV_TEST_ONLY',
        validFromSimTime: '0',
        validUntilSimTime: '86400000',
        requestingOfficeId: 'FINANCE',
        programmeOwnerOfficeId: 'FINANCE',
        classification: 'ORDINARY_DEPARTMENTAL',
        funding: 'FULL_UNCONDITIONAL',
        requiredApprovalOffices: ['FINANCE'],
      },
      command = C.parseCanonicalCommand(
        {
          schemaVersion: C.COMMAND_SCHEMA_VERSION,
          worldId: world,
          countryId: 'COUNTRY_01',
          officeId: 'FINANCE',
          actorId: 'ACTOR_TEST_ONLY_MIXED',
          authSubject: '11111111-1111-4111-8111-111111111111',
          commandId: 'COMMAND_PAGE_' + identity,
          idempotencyKey: 'KEY_PAGE_' + identity,
          commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
          expectedWorldVersion: current.head.worldVersion,
          simTime: '1',
          correlationId: 'CORRELATION_PAGE_' + identity,
          submittedAtReal: at,
          payload: {
            operation,
            scope: {
              worldId: world,
              countryId: 'COUNTRY_01',
              entityRef: policy.governmentEntityId,
              envelopeRef: policy.envelopeRef,
              effectivePeriodRef: policy.effectivePeriodRef,
            },
            currency: 'XAA',
            amount: operation === 'SET_ENVELOPE' ? '1' : '0.25',
            envelopeRevisionRef: 'ENVELOPE_REV_' + envelopeIdentity,
            lineRef:
              operation === 'SET_ENVELOPE' ? null : 'LINE_PAGE_' + identity,
            revisionRef:
              operation === 'SET_ENVELOPE'
                ? 'ENVELOPE_REV_' + identity
                : 'LINE_REV_' + identity,
            predecessorRevisionRef: null,
          },
        },
        sha,
      ),
      actualOpening = [
        openingEncumbrances[0]!,
        ...current.result.socialReservations.map((r) => ({
          reference: r.reservationId,
          accountId: r.accountId,
          amount: r.amount,
          currency: r.currency,
        })),
      ],
      source: FinanceNativeBudgetSource = {
        policy,
        binding: {
          seedRef: f.seed.seedId,
          seedFingerprint: f.seed.fingerprint,
          admissionRef: options.admissionRef ?? 'TEST_ONLY_ADMISSION_NOT_PG',
          financialSourceId: f.seed.sources[0]!.sourceId,
          originalsSHA256: 'sha256:' + 'b'.repeat(64),
          policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
          treasuryAccountId: a.treasuryAsset.accountId,
          treasuryClaimId: a.treasuryAsset.claimId!,
          openingEncumbranceHash: C.canonicalSha256(
            C.canonicalHashInput(actualOpening),
            sha,
          ),
        },
        openingEncumbrances: actualOpening,
        financialState: current.result.financialState!,
        mixedPrefixEvidence: current.lastPage.evidence,
        frames: null,
        pagedPrefix: {
          evidence: current.lastPage.evidence,
          lastPageFrames: current.lastPage.frames,
        },
        worldVersion: current.head.worldVersion,
        eventSequence: current.head.eventSequence,
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
      events: value.transition.events,
      transition: value.transition,
      receipt: value.receipt,
      financialPostingBatches: [],
      inventoryPostings: [],
    };
  };
  return {
    f,
    social,
    opening,
    openingEncumbrances,
    fxOriginals,
    start,
    page,
    append,
    budget,
  };
}
