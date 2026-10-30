/** Pure Core fixtures: genuine Core ledger and command authorization brands,
 * but explicit TEST_ONLY originals/policy. SQL admission/custody is separate. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  FINANCE_NATIVE_BUDGET_RULE,
  evaluateFinanceNativeBudgetSource,
  prepareFinanceNativeBudgetTransition,
  replayFinanceNativeBudgetHistory,
  type FinanceNativeBudgetPolicy,
  type FinanceNativeBudgetSource,
} from '../../packages/core/src/commands/finance-budget-native.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-28T00:00:00.000Z',
  world = C.worldId('WORLD_TEST_ONLY_NATIVE_BUDGET'),
  country = C.countryId('COUNTRY_01'),
  subject = C.authSubject('11111111-1111-4111-8111-111111111111');
function fixture() {
  const gov = C.legalEntityId('GOV_TEST_ONLY'),
    cb = C.legalEntityId('CB_TEST_ONLY'),
    claim = C.financialClaimId('CLAIM_TEST_ONLY_TGA');
  const accounts = [gov, cb].map((ownerId, i) =>
    C.createFinancialAccount({
      worldId: world,
      countryId: country,
      accountId: C.financialAccountId(`ACCOUNT_TEST_ONLY_${i}`),
      ownerId,
      counterpartyEntityId: i === 0 ? cb : gov,
      claimId: claim,
      currency: 'GBP',
      accountClass: i === 0 ? 'ASSET' : 'LIABILITY',
    }),
  );
  const opening = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/finance-budget-native.test.ts',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { classification: 'TEST_ONLY_NOT_ADMITTED' },
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY'),
      worldId: world,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [opening],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('BATCH_TEST_ONLY'),
          sourceId: opening.sourceId,
          settlementCurrency: 'GBP',
          legs: accounts.map((account, i) => ({
            legId: C.financialOpeningLegId(`LEG_TEST_ONLY_${i}`),
            account,
            direction: i === 0 ? 'DEBIT' : 'CREDIT',
            amount: C.Money.from('1000', 'GBP'),
            counterpartLegId: C.financialOpeningLegId(`LEG_TEST_ONLY_${1 - i}`),
          })),
        },
      ],
    },
    sha,
  );
  const policy: FinanceNativeBudgetPolicy = {
    schemaVersion: 'finance-native-budget-policy-v1',
    ruleRef: FINANCE_NATIVE_BUDGET_RULE,
    ruleRevision: 'RULE_REV_TEST_ONLY',
    sourceDocumentSHA256: 'sha256:' + 'a'.repeat(64),
    normativeUnits: [
      'FINANCE-U0247',
      'FINANCE-U0252',
      'FINANCE-U0265',
      'FINANCE-U0295',
    ],
    worldId: world,
    countryId: country,
    governmentEntityId: gov,
    currency: 'GBP',
    envelopeRef: 'ENVELOPE_TEST_ONLY',
    effectivePeriodRef: 'PERIOD_TEST_ONLY',
    periodRevision: 'PERIOD_REV_TEST_ONLY',
    validFromSimTime: '0',
    validUntilSimTime: '100',
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    requiredApprovalOffices: ['FINANCE'],
  };
  const source: FinanceNativeBudgetSource = {
    policy,
    binding: {
      seedRef: seed.seedId,
      seedFingerprint: seed.fingerprint,
      admissionRef: 'ADMISSION_TEST_ONLY',
      financialSourceId: opening.sourceId,
      originalsSHA256: 'sha256:' + 'b'.repeat(64),
      policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
      treasuryAccountId: accounts[0]!.accountId,
      treasuryClaimId: claim,
      openingEncumbranceHash: C.canonicalSha256(C.canonicalHashInput([]), sha),
    },
    financialState: C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha })
      .financial,
    frames: [],
    openingEncumbrances: [],
    worldVersion: '0',
    eventSequence: '0',
  };
  const command = (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE' = 'SET_ENVELOPE',
    amount = '800',
    version = '0',
    suffix = 'SET',
  ) =>
    C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: `COMMAND_TEST_ONLY_${suffix}`,
        idempotencyKey: `KEY_TEST_ONLY_${suffix}`,
        worldId: world,
        countryId: country,
        officeId: 'FINANCE',
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: subject,
        commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        expectedWorldVersion: version,
        simTime: '0',
        correlationId: 'CORRELATION_TEST_ONLY',
        submittedAtReal: at,
        payload: {
          operation,
          scope: {
            worldId: world,
            countryId: country,
            entityRef: gov,
            envelopeRef: policy.envelopeRef,
            effectivePeriodRef: policy.effectivePeriodRef,
          },
          currency: 'GBP',
          amount,
          envelopeRevisionRef: 'ENVELOPE_REV_TEST_ONLY',
          lineRef:
            operation === 'SET_ENVELOPE' ? null : `LINE_TEST_ONLY_${suffix}`,
          revisionRef:
            operation === 'SET_ENVELOPE'
              ? 'ENVELOPE_REV_TEST_ONLY'
              : `LINE_REV_TEST_ONLY_${suffix}`,
          predecessorRevisionRef: null,
        },
      },
      sha,
    );
  return { seed, source, command };
}
async function run(
  command: C.CanonicalCommand,
  source: FinanceNativeBudgetSource,
) {
  let active = true,
    proof: C.CommitAuthorizationProof | undefined,
    result:
      | Awaited<ReturnType<typeof prepareFinanceNativeBudgetTransition>>
      | undefined;
  const intakeAuthorization = await C.authorizeOfficeCapability({
    principal: {
      authSubject: subject,
      facts: { user_id: subject, display_name: null, school_id: null },
      token: {
        subject,
        issuer: 'TEST_ONLY',
        audience: 'TEST_ONLY',
        issuedAt: at,
        expiresAt: '2026-10-29T00:00:00.000Z',
      },
    },
    resolver: {
      resolveCurrentIdentity: async () => subject,
      resolveCurrentMembership: async () => ({
        authSubject: subject,
        worldId: world,
        countryId: country,
        teamId: C.teamId('TEAM_TEST_ONLY'),
        authorizationVersion: 'REV_TEST_ONLY',
        officeAssignments: [C.officeId('FINANCE')],
        active,
        suspended: false,
        isWorldAdmin: false,
        negotiationPartyIds: [],
      }),
    },
    worldId: world,
    requestedCountryId: country,
    requestedOfficeId: 'FINANCE',
    capability: 'FINANCE_BUDGET',
  });
  await C.processQueuedCommand({
    command,
    authorityKind: 'DISCRETIONARY_USER',
    requiredCapability: 'FINANCE_BUDGET',
    intakeAuthorization,
    commitSimTime: C.SimTime.fromTicks('0'),
    recordedAtReal: at,
    persistence: {
      readFinalReceipt: async () => null,
      recordZeroEffectReceipt: async (r) => r,
      commitAuthorizedCommand: async (input) => {
        proof = input.commitAuthorization!;
        result = await prepareFinanceNativeBudgetTransition({
          command,
          authorization: proof,
          source,
          recordedAtReal: at,
          sha256Hex: sha,
        });
        return { transition: result.transition, receipt: result.receipt };
      },
    },
  });
  if (!result || !proof) throw Error('native transition not issued');
  return {
    result,
    proof,
    revoke() {
      active = false;
    },
  };
}
describe('native Finance own-administration budget rules / Core TEST_ONLY fixtures', () => {
  it('commits envelope then three-event appropriation without money/stock effects and deterministically replays', async () => {
    const f = fixture(),
      c = f.command(),
      first = await run(c, f.source);
    expect(first.result.receipt.worldVersionAfter).toBe('1');
    expect(first.result.transition.events).toHaveLength(1);
    expect(first.result.financialPostingBatches).toEqual([]);
    const frame = { command: c, events: first.result.transition.events };
    const secondSource = {
      ...f.source,
      worldVersion: '1',
      eventSequence: '1',
      frames: [frame],
      financialState: C.rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [
          {
            command: c,
            transition: first.result.transition,
            inventoryPostings: [],
            financialPostingBatches: [],
          },
        ],
        sha256Hex: sha,
      }).financial,
    };
    const line = f.command('APPROVE_NEW_LINE', '600', '1', 'LINE'),
      second = await run(line, secondSource);
    expect(second.result.transition.events.map((e) => e.sequence)).toEqual([
      '2',
      '3',
      '4',
    ]);
    expect(second.result.receipt.worldVersionAfter).toBe('2');
    const replay = replayFinanceNativeBudgetHistory(
      world,
      [frame, { command: line, events: second.result.transition.events }],
      sha,
    );
    expect(replay).toEqual(second.result.nextState);
    expect(replay.envelopes[0]?.lines[0]).toMatchObject({
      appropriation: '600',
      paid: '0',
      reserved: '0',
      outstandingCommitments: '0',
    });
    expect(
      f.source.financialState.positions[0]?.netDebitBalance.toCanonicalValue()
        .amount,
    ).toBe('1000');
  });
  it('protects adopted encumbrances and never allocates the same treasury capacity to another envelope', async () => {
    const f = fixture(),
      c = f.command();
    const openingEncumbrances = [
      {
        reference: 'RESERVATION_TEST_ONLY',
        accountId: f.source.binding.treasuryAccountId,
        amount: '900',
        currency: 'GBP',
      },
    ];
    expect(() =>
      evaluateFinanceNativeBudgetSource({
        command: c,
        source: {
          ...f.source,
          openingEncumbrances,
          binding: {
            ...f.source.binding,
            openingEncumbranceHash: C.canonicalSha256(
              C.canonicalHashInput(openingEncumbrances),
              sha,
            ),
          },
        },
        sha256Hex: sha,
      }),
    ).toThrow('INSUFFICIENT_UNENCUMBERED');
    const first = await run(c, f.source),
      policy = { ...f.source.policy, envelopeRef: 'OTHER_ENVELOPE_TEST_ONLY' };
    const rawSecond = Object.fromEntries(
      Object.entries(f.command('SET_ENVELOPE', '300', '1', 'SECOND')).filter(
        ([key]) =>
          !['canonicalPayload', 'payloadHash', 'fingerprint'].includes(key),
      ),
    );
    const second = C.parseCanonicalCommand(
      {
        ...rawSecond,
        payload: {
          ...JSON.parse(c.canonicalPayload),
          scope: {
            ...JSON.parse(c.canonicalPayload).scope,
            envelopeRef: policy.envelopeRef,
          },
          amount: '300',
        },
        simTime: '0',
      },
      sha,
    );
    const source = {
      ...f.source,
      worldVersion: '1',
      eventSequence: '1',
      policy,
      binding: {
        ...f.source.binding,
        policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
      },
      frames: [{ command: c, events: first.result.transition.events }],
      financialState: C.rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [
          {
            command: c,
            transition: first.result.transition,
            inventoryPostings: [],
            financialPostingBatches: [],
          },
        ],
        sha256Hex: sha,
      }).financial,
    };
    expect(() =>
      evaluateFinanceNativeBudgetSource({
        command: second,
        source,
        sha256Hex: sha,
      }),
    ).toThrow('INSUFFICIENT_UNENCUMBERED');
  });
  it('rejects invented authority, stale ledger/head and wrong source/currency without a transition', async () => {
    const f = fixture(),
      c = f.command(),
      good = await run(c, f.source);
    await expect(
      prepareFinanceNativeBudgetTransition({
        command: c,
        authorization: { ...good.proof },
        source: f.source,
        recordedAtReal: at,
        sha256Hex: sha,
      }),
    ).rejects.toThrow('CURRENT_COMMAND_BOUND');
    for (const source of [
      { ...f.source, worldVersion: '1' },
      { ...f.source, financialState: { ...f.source.financialState } },
      {
        ...f.source,
        binding: {
          ...f.source.binding,
          policyHash: 'sha256:' + '0'.repeat(64),
        },
      },
      {
        ...f.source,
        binding: { ...f.source.binding, treasuryClaimId: 'OTHER_CLAIM' },
      },
    ])
      await expect(
        prepareFinanceNativeBudgetTransition({
          command: c,
          authorization: good.proof,
          source,
          recordedAtReal: at,
          sha256Hex: sha,
        }),
      ).rejects.toThrow();
    good.revoke();
    await expect(
      prepareFinanceNativeBudgetTransition({
        command: c,
        authorization: good.proof,
        source: f.source,
        recordedAtReal: at,
        sha256Hex: sha,
      }),
    ).rejects.toThrow();
  });
  it('rejects incomplete history, reused slots and unsupported cross-office/conditional policy', async () => {
    const f = fixture(),
      c = f.command(),
      first = await run(c, f.source),
      frame = { command: c, events: first.result.transition.events };
    expect(() =>
      replayFinanceNativeBudgetHistory(world, [frame, frame], sha),
    ).toThrow();
    expect(() =>
      replayFinanceNativeBudgetHistory(world, [{ ...frame, events: [] }], sha),
    ).toThrow();
    const policy = {
      ...f.source.policy,
      programmeOwnerOfficeId: 'SOCIAL',
    } as unknown as FinanceNativeBudgetPolicy;
    await expect(
      prepareFinanceNativeBudgetTransition({
        command: c,
        authorization: first.proof,
        source: {
          ...f.source,
          policy,
          binding: {
            ...f.source.binding,
            policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
          },
        },
        recordedAtReal: at,
        sha256Hex: sha,
      }),
    ).rejects.toThrow('APPROVAL_RULE');
  });
});
