import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Money,
  SimTime,
  CENTRAL_BANK_OMO_COMMAND,
  CENTRAL_BANK_OMO_CAPABILITY,
  authorizeOfficeCapability,
  canonicalSerialize,
  centralBankOmoSourceHash,
  createFinancialAccount,
  createOpeningSeed,
  createOpeningSource,
  createFinalCommandReceipt,
  financialAccountId,
  financialClaimId,
  financialOpeningBatchId,
  financialOpeningLegId,
  legalEntityId,
  countryId,
  openingSeedId,
  openingSourceId,
  teamId,
  worldId,
  workerId,
  officeId,
  acquireWorldWriterLease,
  worldWriterLeaseRequest,
  createWorldWriterCommitAssertion,
  parseCanonicalCommand,
  parseCentralBankOmoIntent,
  prepareCentralBankOmoTransition,
  processQueuedCommand,
  rebuildV08LedgersFromLineage,
  replayCentralBankOmoRights,
  type CentralBankOmoIntent,
  type CentralBankOmoSource,
  type CentralBankOmoSourceFacts,
  type CommercialBankLedgerSnapshot,
  type CentralBankLedgerSnapshot,
  type FinancialAccount,
  type FinancialAccountClass,
  type MembershipSnapshot,
  type CommitAuthorizationProof,
} from '@econmind/core';
import { applyFinancialPostingBatch } from '../../packages/core/dist/finance/financial-ledger.js';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import {
  createCentralBankOmoCandidateFactory,
  loadCentralBankOmoCandidateSource,
  type CentralBankOmoPreparation,
} from '../../apps/world-worker/src/persistence/central-bank-omo-candidate-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const WORLD = worldId('WORLD_TEST_ONLY_CB1');
const COUNTRY = countryId('COUNTRY_TEST_ONLY_CB1');
const BANK = legalEntityId('ENTITY_TEST_ONLY_BANK');
const CB = legalEntityId('ENTITY_TEST_ONLY_CB');
const TREASURY = legalEntityId('ENTITY_TEST_ONLY_TREASURY');
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const AT = '2026-10-07T00:00:00.000Z';
const money = (amount: string) => ({ amount, currency: 'GBP' });
const bankTemplate: CommercialBankLedgerSnapshot = {
  bankRef: BANK,
  centralBankRef: CB,
  currency: 'GBP',
  reservesAtCentralBank: money('100'),
  settlementCash: money('10'),
  loanAssets: money('10'),
  governmentSecurities: money('100'),
  otherAssets: money('10'),
  demandDeposits: money('100'),
  savingsDeposits: money('10'),
  timeDeposits: money('10'),
  wholesaleFunding: money('10'),
  centralBankRefinancingBorrowing: money('10'),
  centralBankEmergencyLiquidityBorrowing: money('10'),
  otherLiabilities: money('10'),
  equity: money('70'),
  nonPerformingLoans: money('0'),
};
const centralBankTemplate: CentralBankLedgerSnapshot = {
  centralBankRef: CB,
  commercialBankRef: BANK,
  currency: 'GBP',
  governmentSecurities: money('100'),
  regularRefinancingLoans: money('10'),
  emergencyLiquidityLoans: money('10'),
  otherAssets: money('10'),
  currencyInCirculation: money('10'),
  commercialBankReserves: money('100'),
  treasuryDeposits: money('5'),
  centralBankBills: money('5'),
  otherLiabilities: money('5'),
  equity: money('5'),
};

function fixture(
  direction: CentralBankOmoIntent['direction'] = 'BUY_GOVERNMENT_SECURITIES',
  faceAmount = '8',
  reserveAmount = '100',
) {
  const bank: CommercialBankLedgerSnapshot = {
    ...bankTemplate,
    reservesAtCentralBank: money(reserveAmount),
    equity: money(
      Money.from(reserveAmount, 'GBP')
        .subtract(Money.from('30', 'GBP'))
        .amount.toString(),
    ),
  };
  const centralBank: CentralBankLedgerSnapshot = {
    ...centralBankTemplate,
    commercialBankReserves: money(reserveAmount),
    equity: money(
      Money.from('105', 'GBP')
        .subtract(Money.from(reserveAmount, 'GBP'))
        .amount.toString(),
    ),
  };
  const accounts: FinancialAccount[] = [];
  const mappings = (
    snapshot: CommercialBankLedgerSnapshot | CentralBankLedgerSnapshot,
    owner: typeof BANK,
  ) => {
    const result: Record<string, ReturnType<typeof financialAccountId>> = {};
    for (const [field, value] of Object.entries(snapshot)) {
      if (field === 'nonPerformingLoans' || typeof value !== 'object') continue;
      const liability =
        /Deposits|Funding|Borrowing|Liabilities|currencyInCirculation|commercialBankReserves|treasuryDeposits|centralBankBills/u.test(
          field,
        );
      const accountClass: FinancialAccountClass =
        field === 'equity'
          ? 'EQUITY'
          : field === 'settlementCash'
            ? 'CASH'
            : liability
              ? 'LIABILITY'
              : 'ASSET';
      const reserve =
        field === 'reservesAtCentralBank' || field === 'commercialBankReserves';
      const account = createFinancialAccount({
        worldId: WORLD,
        countryId: COUNTRY,
        ownerId: owner,
        accountId: financialAccountId(`${owner}_${field.toUpperCase()}`),
        currency: 'GBP',
        accountClass,
        claimId: reserve ? financialClaimId('CLAIM_TEST_ONLY_R') : null,
        counterpartyEntityId: reserve ? (owner === BANK ? CB : BANK) : null,
      });
      accounts.push(account);
      result[field] = account.accountId;
    }
    return result;
  };
  const bankAccounts = mappings(bank, BANK);
  const centralBankAccounts = mappings(centralBank, CB);
  const openingSource = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_TEST_ONLY_CB1'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/cb1-omo-source-draft.test.ts',
      sourceVersion: 'TEST_ONLY_CB1_V1',
      payload: { notice: 'NOT_OFFICIAL_NO_70_COUNTRY_AUTHORITY' },
    },
    sha,
  );
  const leg = (account: FinancialAccount) =>
    financialOpeningLegId(`OPEN_${account.accountId}`);
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_TEST_ONLY_CB1'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [openingSource],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: financialOpeningBatchId('BATCH_TEST_ONLY_OPEN_CB1'),
          sourceId: openingSource.sourceId,
          settlementCurrency: 'GBP',
          legs: accounts.map((account) => {
            const bankOwned = account.ownerId === BANK;
            const map = bankOwned ? bankAccounts : centralBankAccounts;
            const field = Object.keys(map).find(
              (key) => map[key] === account.accountId,
            )!;
            const snapshot = (bankOwned
              ? bank
              : centralBank) as unknown as Record<string, { amount: string }>;
            const debit =
              account.accountClass === 'ASSET' ||
              account.accountClass === 'CASH' ||
              (account.accountClass === 'EQUITY' &&
                Money.from(snapshot[field]!.amount, 'GBP').amount.lt('0'));
            const counterpartId =
              account.claimId !== null
                ? bankOwned
                  ? centralBankAccounts.commercialBankReserves!
                  : bankAccounts.reservesAtCentralBank!
                : debit
                  ? bankOwned
                    ? map.demandDeposits!
                    : map.treasuryDeposits!
                  : map.governmentSecurities!;
            return {
              legId: leg(account),
              account,
              direction: debit ? ('DEBIT' as const) : ('CREDIT' as const),
              amount: Money.from(
                Money.from(snapshot[field]!.amount, 'GBP')
                  .amount.abs()
                  .toString(),
                'GBP',
              ),
              counterpartLegId: leg(
                accounts.find((entry) => entry.accountId === counterpartId)!,
              ),
            };
          }),
        },
      ],
    },
    sha,
  );
  const intent: CentralBankOmoIntent = {
    schemaVersion: 'central-bank-omo-intent-v1',
    direction,
    securityRef: 'SECURITY_TEST_ONLY_GOV',
    batchRef: 'BATCH_TEST_ONLY_GOV',
    faceValue: money(faceAmount),
    settlementSimTime: '10000',
    policyNote: null,
  };
  const command = parseCanonicalCommand(
    {
      actorId: 'ACTOR_TEST_ONLY_CB1',
      authSubject: SUBJECT,
      commandId: `COMMAND_CB1_${direction}`,
      commandType: CENTRAL_BANK_OMO_COMMAND,
      correlationId: 'CORRELATION_CB1',
      countryId: COUNTRY,
      expectedWorldVersion: '0',
      idempotencyKey: `IDEMPOTENCY_CB1_${direction}`,
      officeId: 'CENTRAL_BANK',
      payload: intent,
      schemaVersion: COMMAND_SCHEMA_VERSION,
      simTime: '10000',
      submittedAtReal: AT,
      worldId: WORLD,
    },
    sha,
  );
  const facts: CentralBankOmoSourceFacts = {
    worldId: WORLD,
    countryId: COUNTRY,
    worldVersion: '0',
    currentSimTime: '10000',
    currentEventSequence: '0',
    domesticTreasuryRef: TREASURY,
    bank,
    centralBank,
    bankAccounts,
    centralBankAccounts,
    holdings: [BANK, CB].map((holderRef) => ({
      securityRef: intent.securityRef,
      batchRef: intent.batchRef,
      issuerRef: TREASURY,
      holderRef,
      currency: 'GBP',
      maturitySimTime: '100000',
      faceValue: '80',
      encumberedFaceValue: '0',
      carryingValue: '100',
    })),
    quote: {
      quoteRef: 'QUOTE_TEST_ONLY_GOV',
      securityRef: intent.securityRef,
      batchRef: intent.batchRef,
      issuerRef: TREASURY,
      currency: 'GBP',
      pricePerFace: '1.25',
      validAtSimTime: '10000',
      sourceRef: 'SOURCE_TEST_ONLY_QUOTE',
      worldVersion: '0',
    },
  };
  const source: CentralBankOmoSource = {
    facts,
    financialState: rebuildV08LedgersFromLineage({ seed, sha256Hex: sha })
      .financial,
    trace: {
      traceRef: 'TRACE_TEST_ONLY_CB1',
      calculationVersion: 'CB1.V1',
      snapshot: {
        lineageRef: 'LINEAGE_TEST_ONLY_CB1',
        sourceVersion: 'WORLD_VERSION.0',
        snapshotRef: 'SNAPSHOT_TEST_ONLY_CB1',
        snapshotHash: centralBankOmoSourceHash(facts, sha),
        predecessorSnapshotHash: null,
      },
      snapshotAt: { amount: '10000', unit: 'sim_millisecond' },
    },
  };
  const preparation: CentralBankOmoPreparation = {
    source,
    commitAssertion: createWorldWriterCommitAssertion(
      acquireWorldWriterLease(
        null,
        worldWriterLeaseRequest(
          WORLD,
          workerId('WORKER_TEST_ONLY_CB1'),
          AT,
          '2026-10-07T00:01:00.000Z',
        ),
      ).lease,
      '0',
    ),
    eventId: 'EVENT_TEST_ONLY_CB1',
    eventSequence: '1',
    financialBatchId: 'POSTING_TEST_ONLY_CB1',
    outboxMessageId: 'OUTBOX_TEST_ONLY_CB1',
  };
  return { command, seed, intent, preparation };
}

async function authorized(value: ReturnType<typeof fixture>) {
  let active = true;
  const membership: MembershipSnapshot = {
    authSubject: value.command.authSubject,
    authorizationVersion: '1',
    worldId: WORLD,
    teamId: teamId('TEAM_TEST_ONLY_CB1'),
    countryId: COUNTRY,
    officeAssignments: [officeId('CENTRAL_BANK')],
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: [],
  };
  const intakeAuthorization = await authorizeOfficeCapability({
    principal: {
      authSubject: value.command.authSubject,
      facts: { user_id: SUBJECT, display_name: null, school_id: null },
      token: {
        subject: SUBJECT,
        issuer: 'TEST_ONLY',
        audience: 'TEST_ONLY',
        issuedAt: AT,
        expiresAt: '2026-10-08T00:00:00.000Z',
      },
    },
    resolver: {
      async resolveCurrentIdentity() {
        return value.command.authSubject;
      },
      async resolveCurrentMembership() {
        return { ...membership, active };
      },
    },
    worldId: WORLD,
    requestedCountryId: COUNTRY,
    requestedOfficeId: officeId('CENTRAL_BANK'),
    capability: CENTRAL_BANK_OMO_CAPABILITY,
  });
  let proof: CommitAuthorizationProof | null = null;
  await processQueuedCommand({
    command: value.command,
    authorityKind: 'DISCRETIONARY_USER',
    commitSimTime: SimTime.fromTicks('10000'),
    recordedAtReal: AT,
    requiredCapability: CENTRAL_BANK_OMO_CAPABILITY,
    intakeAuthorization,
    persistence: {
      async readFinalReceipt() {
        return null;
      },
      async recordZeroEffectReceipt(receipt) {
        return receipt;
      },
      async commitAuthorizedCommand(input) {
        proof = input.commitAuthorization;
        const result = prepareCentralBankOmoTransition({
          ...value.preparation,
          command: value.command,
          sha256Hex: sha,
          observedAtReal: AT,
        });
        return {
          transition: result.transition,
          receipt: createFinalCommandReceipt({
            command: value.command,
            outcome: 'COMMITTED',
            reasonCode: null,
            transition: result.transition,
            simTime: value.command.simTime,
            recordedAtReal: AT,
          }),
        };
      },
    },
  });
  if (proof === null) throw new Error('issued proof missing');
  return {
    proof: proof as CommitAuthorizationProof,
    intakeAuthorization,
    revoke() {
      active = false;
    },
  };
}

describe('CB-1 non-activated TEST_ONLY source-to-draft', () => {
  it('policy note is optional and has no accounting effect; unissued proof cannot read source', async () => {
    const f = fixture();
    const auth = await authorized(f);
    const { policyNote: _note, ...payload } = f.intent;
    void _note;
    const command = parseCanonicalCommand(
      {
        actorId: f.command.actorId,
        authSubject: SUBJECT,
        commandId: f.command.commandId,
        commandType: CENTRAL_BANK_OMO_COMMAND,
        correlationId: f.command.correlationId,
        countryId: COUNTRY,
        expectedWorldVersion: '0',
        idempotencyKey: f.command.idempotencyKey,
        officeId: 'CENTRAL_BANK',
        payload,
        schemaVersion: COMMAND_SCHEMA_VERSION,
        simTime: '10000',
        submittedAtReal: AT,
        worldId: WORLD,
      },
      sha,
    );
    expect(parseCentralBankOmoIntent(command, sha).policyNote).toBeNull();
    const reader = vi.fn(async () => f.preparation);
    await expect(
      loadCentralBankOmoCandidateSource({
        command: f.command,
        commitAuthorization: { ...auth.proof },
        reader: { read: reader },
        sha256Hex: sha,
      }),
    ).rejects.toThrow('issued current');
    expect(reader).not.toHaveBeenCalled();
    const result = prepareCentralBankOmoTransition({
      ...f.preparation,
      command,
      observedAtReal: AT,
      sha256Hex: sha,
    });
    expect(
      result.posting.legs.map((leg) => leg.amount.toCanonicalValue()),
    ).toEqual(Array.from({ length: 4 }, () => money('10')));
  });
  it('BUY transfers the actual batch into an explicit zero holding without moving other securities', () => {
    const f = fixture();
    const source = f.preparation.source;
    const target = source.facts.holdings[1]!;
    const facts = {
      ...source.facts,
      holdings: [
        source.facts.holdings[0]!,
        { ...target, faceValue: '0', carryingValue: '0' },
        {
          ...target,
          securityRef: 'SECURITY_OTHER_TEST_ONLY',
          batchRef: 'BATCH_OTHER_TEST_ONLY',
        },
      ],
    };
    const result = prepareCentralBankOmoTransition({
      ...f.preparation,
      source: {
        ...source,
        facts,
        trace: {
          ...source.trace,
          snapshot: {
            ...source.trace.snapshot,
            snapshotHash: centralBankOmoSourceHash(facts, sha),
          },
        },
      },
      command: f.command,
      observedAtReal: AT,
      sha256Hex: sha,
    });
    expect(result.holdingsAfter[1]!.faceValue).toBe('8');
    expect(result.holdingsAfter[1]!.carryingValue).toBe('10');
    expect(result.holdingsAfter[2]).toEqual(facts.holdings[2]);
  });
  it('SELL cannot overdraw R even when actual securities are sufficient', async () => {
    const good = fixture('SELL_GOVERNMENT_SECURITIES');
    const auth = await authorized(good);
    const lowReserves = fixture('SELL_GOVERNMENT_SECURITIES', '8', '5');
    const factory = vi.fn();
    await expect(
      (async () => {
        const preparation = await loadCentralBankOmoCandidateSource({
          command: lowReserves.command,
          commitAuthorization: auth.proof,
          reader: {
            async read() {
              return lowReserves.preparation;
            },
          },
          sha256Hex: sha,
        });
        factory(preparation);
      })(),
    ).rejects.toThrow('reserves negative');
    expect(factory).not.toHaveBeenCalled();
    expect(lowReserves.preparation.source.financialState.worldVersion).toBe(
      '0',
    );
  });
  it('fractional face/quote remains exact; canonical Atomic candidate accepts one transition', async () => {
    const f = fixture('BUY_GOVERNMENT_SECURITIES', '0.1');
    const auth = await authorized(f);
    const preparation = await loadCentralBankOmoCandidateSource({
      command: f.command,
      commitAuthorization: auth.proof,
      reader: {
        async read() {
          return f.preparation;
        },
      },
      sha256Hex: sha,
    });
    const draft = await createCentralBankOmoCandidateFactory({
      preparation,
      sha256Hex: sha,
    }).prepare({
      command: f.command,
      commitAuthorization: auth.proof,
      observedAtReal: AT,
    });
    expect(
      draft.financialPostingBatches[0]!.legs.every(
        (leg) => leg.amount.amount.toString() === '0.125',
      ),
    ).toBe(true);
    const candidate = prepareAtomicTransitionCandidate({
      command: f.command,
      draft,
      commitAuthorization: auth.proof,
      sha256Hex: sha,
    });
    expect(candidate.commitAssertion).toBe(f.preparation.commitAssertion);
    expect(candidate.transition.worldVersionAfter).toBe('1');
  });

  it('existing final receipt avoids a second factory invocation/economic effect', async () => {
    const f = fixture();
    const auth = await authorized(f);
    let final: ReturnType<typeof createFinalCommandReceipt> | null = null;
    const committed = vi.fn(
      async (input: {
        command: typeof f.command;
        commitAuthorization: CommitAuthorizationProof | null;
      }) => {
        const preparation = await loadCentralBankOmoCandidateSource({
          command: input.command,
          commitAuthorization: input.commitAuthorization,
          reader: {
            async read() {
              return f.preparation;
            },
          },
          sha256Hex: sha,
        });
        const draft = await createCentralBankOmoCandidateFactory({
          preparation,
          sha256Hex: sha,
        }).prepare({
          command: input.command,
          commitAuthorization: input.commitAuthorization,
          observedAtReal: AT,
        });
        final = draft.receipt;
        return { transition: draft.transition, receipt: draft.receipt };
      },
    );
    const input = {
      command: f.command,
      authorityKind: 'DISCRETIONARY_USER' as const,
      commitSimTime: f.command.simTime,
      recordedAtReal: AT,
      requiredCapability: CENTRAL_BANK_OMO_CAPABILITY,
      intakeAuthorization: auth.intakeAuthorization,
      persistence: {
        async readFinalReceipt() {
          return final;
        },
        async recordZeroEffectReceipt(
          receipt: ReturnType<typeof createFinalCommandReceipt>,
        ) {
          return receipt;
        },
        commitAuthorizedCommand: committed,
      },
    };
    const first = await processQueuedCommand(input);
    const second = await processQueuedCommand(input);
    expect(first.source).toBe('NEW_FINAL');
    expect(second.source).toBe('EXISTING_FINAL');
    expect(second.receipt).toEqual(first.receipt);
    expect(committed).toHaveBeenCalledTimes(1);
  });

  it('revocation during server source acquisition never enters candidate factory', async () => {
    const f = fixture();
    const auth = await authorized(f);
    const factory = vi.fn();
    await expect(
      (async () => {
        const preparation = await loadCentralBankOmoCandidateSource({
          command: f.command,
          commitAuthorization: auth.proof,
          reader: {
            async read() {
              auth.revoke();
              return f.preparation;
            },
          },
          sha256Hex: sha,
        });
        factory(preparation);
      })(),
    ).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  it.each(['BUY_GOVERNMENT_SECURITIES', 'SELL_GOVERNMENT_SECURITIES'] as const)(
    '%s uses exact four legs, same R claim, Event and lineage replay',
    async (direction) => {
      const f = fixture(direction);
      const auth = await authorized(f);
      const loaded = await loadCentralBankOmoCandidateSource({
        command: f.command,
        commitAuthorization: auth.proof,
        reader: {
          async read() {
            return f.preparation;
          },
        },
        sha256Hex: sha,
      });
      const factory = createCentralBankOmoCandidateFactory({
        preparation: loaded,
        sha256Hex: sha,
      });
      const draft = await factory.prepare({
        command: f.command,
        commitAuthorization: auth.proof,
        observedAtReal: AT,
      });
      const posting = draft.financialPostingBatches[0]!;
      expect(posting.legs).toHaveLength(4);
      expect(
        posting.legs.map((entry) => entry.amount.toCanonicalValue()),
      ).toEqual(Array.from({ length: 4 }, () => money('10')));
      expect(posting.legs.map((entry) => entry.direction)).toEqual(
        direction.startsWith('BUY')
          ? ['DEBIT', 'CREDIT', 'DEBIT', 'CREDIT']
          : ['CREDIT', 'DEBIT', 'CREDIT', 'DEBIT'],
      );
      expect(posting.legs[1]!.account.claimId).toBe(
        posting.legs[2]!.account.claimId,
      );
      expect(draft.inventoryPostings).toHaveLength(0);
      expect(draft.outboxMessages).toHaveLength(1);
      expect(draft.receipt.eventIds).toEqual(draft.transition.eventIds);
      expect(draft.receipt.worldVersionAfter).toBe('1');
      const result = prepareCentralBankOmoTransition({
        ...f.preparation,
        command: f.command,
        sha256Hex: sha,
        observedAtReal: AT,
      });
      const rebuilt = rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [
          {
            command: f.command,
            transition: result.transition,
            inventoryPostings: [],
            financialPostingBatches: [posting],
          },
        ],
        sha256Hex: sha,
      });
      expect(canonicalSerialize(rebuilt.financial)).toBe(
        canonicalSerialize(result.financial.state),
      );
      expect(
        applyFinancialPostingBatch(result.financial.state, posting).receipt
          .outcome,
      ).toBe('EXACT_DUPLICATE');
      const tga =
        f.preparation.source.facts.centralBankAccounts.treasuryDeposits;
      expect(
        result.financial.state.positions
          .find((entry) => entry.account.accountId === tga)
          ?.netDebitBalance.amount.toString(),
      ).toBe('-5');
      const replay = replayCentralBankOmoRights({
        command: f.command,
        event: result.event,
        source: f.preparation.source,
        financialBatchId: f.preparation.financialBatchId,
        holdings: f.preparation.source.facts.holdings,
        applied: [],
        sha256Hex: sha,
      });
      expect(replay.outcome).toBe('APPLIED');
      expect(replay.holdings.map((entry) => entry.faceValue)).toEqual(
        direction.startsWith('BUY') ? ['72', '88'] : ['88', '72'],
      );
      expect(
        replayCentralBankOmoRights({
          command: f.command,
          event: result.event,
          source: f.preparation.source,
          financialBatchId: f.preparation.financialBatchId,
          holdings: replay.holdings,
          applied: replay.applied,
          sha256Hex: sha,
        }).outcome,
      ).toBe('EXACT_DUPLICATE');
      expect(
        replayCentralBankOmoRights({
          command: f.command,
          event: result.event,
          source: f.preparation.source,
          financialBatchId: f.preparation.financialBatchId,
          holdings: f.preparation.source.facts.holdings,
          applied: [],
          sha256Hex: sha,
        }),
      ).toEqual(replay);
      expect(() =>
        replayCentralBankOmoRights({
          command: f.command,
          event: { ...result.event, canonicalPayload: '{}' },
          source: f.preparation.source,
          financialBatchId: f.preparation.financialBatchId,
          holdings: f.preparation.source.facts.holdings,
          applied: [],
          sha256Hex: sha,
        }),
      ).toThrow();
    },
  );

  it.each([
    'quote',
    'held',
    'encumbered',
    'price',
    'currency',
    'maturity',
    'stale',
    'bank',
    'cb',
    'carrying',
    'time',
    'issuer',
    'snapshot',
    'claim',
    'fence',
  ] as const)(
    'rejects %s before downstream candidate factory; no effects',
    async (defect) => {
      const f = fixture();
      const auth = await authorized(f);
      const original = canonicalSerialize(f.preparation.source.financialState);
      const facts = JSON.parse(
        canonicalSerialize(f.preparation.source.facts),
      ) as CentralBankOmoSourceFacts;
      const mutate = facts as unknown as Record<string, unknown>;
      switch (defect) {
        case 'quote':
          mutate.quote = null;
          break;
        case 'held':
          mutate.holdings = [];
          break;
        case 'encumbered':
          mutate.holdings = facts.holdings.map((h) => ({
            ...h,
            encumberedFaceValue: '80',
          }));
          break;
        case 'price':
          mutate.quote = { ...facts.quote, pricePerFace: '0' };
          break;
        case 'currency':
          mutate.quote = { ...facts.quote, currency: 'GCU' };
          break;
        case 'maturity':
          mutate.holdings = facts.holdings.map((h) => ({
            ...h,
            maturitySimTime: '10000',
          }));
          break;
        case 'stale':
          mutate.worldVersion = '1';
          break;
        case 'bank':
          mutate.bank = { ...facts.bank, equity: money('71') };
          break;
        case 'cb':
          mutate.centralBank = {
            ...facts.centralBank,
            treasuryDeposits: money('999'),
          };
          break;
        case 'carrying':
          mutate.quote = { ...facts.quote, pricePerFace: '1.2' };
          break;
        case 'time':
          mutate.currentSimTime = '10001';
          break;
        case 'issuer':
          mutate.quote = { ...facts.quote, issuerRef: BANK };
          break;
        case 'claim':
          mutate.bankAccounts = {
            ...facts.bankAccounts,
            reservesAtCentralBank: facts.bankAccounts.governmentSecurities,
          };
          break;
        default:
          break;
      }
      const preparation = {
        ...f.preparation,
        source: {
          ...f.preparation.source,
          facts,
          trace: {
            ...f.preparation.source.trace,
            snapshot: {
              ...f.preparation.source.trace.snapshot,
              snapshotHash: centralBankOmoSourceHash(facts, sha),
            },
          },
        },
      };
      if (defect === 'snapshot')
        preparation.source.financialState = {
          ...preparation.source.financialState,
        };
      if (defect === 'fence')
        preparation.commitAssertion = {
          ...preparation.commitAssertion,
          fencingToken: '0',
        };
      const factory = vi.fn();
      await expect(
        (async () => {
          const loaded = await loadCentralBankOmoCandidateSource({
            command: f.command,
            commitAuthorization: auth.proof,
            reader: {
              async read() {
                return preparation;
              },
            },
            sha256Hex: sha,
          });
          factory(loaded);
        })(),
      ).rejects.toThrow();
      expect(factory).not.toHaveBeenCalled();
      expect(canonicalSerialize(f.preparation.source.financialState)).toBe(
        original,
      );
      expect(f.preparation.source.financialState.appliedBatches).toHaveLength(
        0,
      );
    },
  );

  it('missing real source throws with no candidate; caller source/macro fields are rejected', async () => {
    const f = fixture();
    const auth = await authorized(f);
    await expect(
      loadCentralBankOmoCandidateSource({
        command: f.command,
        commitAuthorization: auth.proof,
        reader: {
          async read() {
            throw new Error('OFFICIAL_CB_SOURCE_MISSING');
          },
        },
        sha256Hex: sha,
      }),
    ).rejects.toThrow('OFFICIAL_CB_SOURCE_MISSING');
    for (const extra of [
      { settlementAmount: money('999') },
      { holdings: [] },
      { M1: '999' },
    ]) {
      const command = parseCanonicalCommand(
        {
          actorId: f.command.actorId,
          authSubject: SUBJECT,
          commandId: f.command.commandId,
          commandType: CENTRAL_BANK_OMO_COMMAND,
          correlationId: f.command.correlationId,
          countryId: COUNTRY,
          expectedWorldVersion: '0',
          idempotencyKey: f.command.idempotencyKey,
          officeId: 'CENTRAL_BANK',
          payload: { ...f.intent, ...extra },
          schemaVersion: COMMAND_SCHEMA_VERSION,
          simTime: '10000',
          submittedAtReal: AT,
          worldId: WORLD,
        },
        sha,
      );
      expect(() => parseCentralBankOmoIntent(command, sha)).toThrow();
    }
  });

  it('revoked preparation and server-held transaction-cutoff revision reject without mutation', async () => {
    const f = fixture();
    const auth = await authorized(f);
    const reader = vi.fn(async () => f.preparation);
    auth.revoke();
    await expect(
      loadCentralBankOmoCandidateSource({
        command: f.command,
        commitAuthorization: auth.proof,
        reader: { read: reader },
        sha256Hex: sha,
      }),
    ).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
    const fresh = await authorized(f);
    const statements: string[] = [];
    const transaction: SqlExecutor = {
      async query<Row extends object>(statement: string) {
        statements.push(statement);
        const row = {
          auth_subject: SUBJECT,
          world_id: WORLD,
          country_id: COUNTRY,
          office_id: 'CENTRAL_BANK',
          capability: CENTRAL_BANK_OMO_CAPABILITY,
          team_id: fresh.proof.teamId,
          authorization_version: '2',
        };
        return { rows: [row as unknown as Row], rowCount: 1 };
      },
    };
    await expect(
      createTransactionCutoffAuthorizationGuard().assertCurrent(transaction, {
        command: f.command,
        proof: fresh.proof,
        authorityKind: 'DISCRETIONARY_USER',
        expected: 'AUTHORIZED',
      }),
    ).rejects.toThrow();
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('for key share');
    expect(statements[0]).not.toMatch(/insert|update|delete/iu);
    expect(f.preparation.source.financialState.worldVersion).toBe('0');
  });
});
