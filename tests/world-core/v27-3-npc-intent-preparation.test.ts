import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { authorizeOfficeCapability } from '../../packages/core/src/authorization/offices.js';
import type { ApprovalProposal } from '../../packages/core/src/authorization/approvals.js';
import { canonicalSha256 } from '../../packages/core/src/commands/command.js';
import {
  authSubject,
  actorId,
  commodityId,
  countryId,
  financialAccountId,
  inventoryBatchId,
  inventoryLocationId,
  legalEntityId,
  officeId,
  proposalId,
  teamId,
  worldId,
} from '../../packages/core/src/ids.js';
import {
  prepareNpcResourceAllocationIntent,
  type NpcIntentPreparationInput,
} from '../../packages/core/src/npc/intent-preparation.js';
import { Money } from '../../packages/core/src/numeric/money.js';
import { Quantity } from '../../packages/core/src/numeric/quantity.js';
import { SimTime } from '../../packages/core/src/numeric/sim-time.js';
import { canonicalSerialize } from '../../packages/core/src/serialization/canonical.js';

const WORLD = worldId('WORLD_NPC_TEST');
const COUNTRY = countryId('COUNTRY_NPC_TEST');
const INDUSTRY = officeId('INDUSTRY');
const HOLDER = legalEntityId('ENTITY_NPC_TREASURY');
const SUBJECT = authSubject('550e8400-e29b-41d4-a716-446655440001');
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

async function baseInput(): Promise<NpcIntentPreparationInput> {
  const principal = {
    authSubject: SUBJECT,
    facts: {
      user_id: SUBJECT,
      display_name: null,
      school_id: null,
    },
    token: {
      subject: SUBJECT,
      issuer: 'TEST',
      audience: 'TEST',
      issuedAt: '2026-09-24T00:00:00.000Z',
      expiresAt: '2026-09-25T00:00:00.000Z',
    },
  };
  const officeContext = await authorizeOfficeCapability({
    principal,
    resolver: {
      async resolveCurrentIdentity() {
        return SUBJECT;
      },
      async resolveCurrentMembership() {
        return {
          authorizationVersion: 'AUTH_V1',
          authSubject: SUBJECT,
          worldId: WORLD,
          teamId: teamId('TEAM_NPC_TEST'),
          countryId: COUNTRY,
          officeAssignments: [INDUSTRY],
          active: true,
          suspended: false,
          isWorldAdmin: false,
          negotiationPartyIds: [],
        };
      },
    },
    worldId: WORLD,
    requestedCountryId: COUNTRY,
    requestedOfficeId: INDUSTRY,
    capability: 'INDUSTRY_RESOURCES',
  });
  return {
    worldId: WORLD,
    countryId: COUNTRY,
    worldVersion: '4',
    simTime: SimTime.fromTicks('10000'),
    model: {
      modelRef: 'NPC_MODEL_BASE',
      modelVersion: 'V1',
      decisionRef: 'DECISION_1',
    },
    officeContext,
    approval: null,
    funding: {
      sourceRef: 'FINANCIAL_FACT_1',
      worldVersion: '4',
      account: {
        worldId: WORLD,
        accountId: financialAccountId('ACCOUNT_NPC_CASH'),
        ownerId: HOLDER,
        countryId: COUNTRY,
        accountClass: 'CASH',
        currency: 'GCU',
        claimId: null,
        counterpartyEntityId: null,
      },
      availableCash: Money.from('10.05', 'GCU'),
      remainingBudget: Money.from('9.25', 'GCU'),
      requestedSpend: Money.from('9.2', 'GCU'),
    },
    inventory: {
      sourceRef: 'INVENTORY_FACT_1',
      worldVersion: '4',
      account: {
        worldId: WORLD,
        countryId: COUNTRY,
        commodityId: commodityId('COMMODITY_STEEL'),
        batchId: inventoryBatchId('BATCH_NPC_STEEL'),
        unit: 't',
        physicalLocationId: inventoryLocationId('LOCATION_NPC'),
        bucket: 'AVAILABLE',
        reservationId: null,
        shipmentId: null,
        titleHolderId: HOLDER,
        riskBearerId: HOLDER,
        economicRecognitionId: null,
      },
      available: Quantity.from('2.0001', 't'),
      requested: Quantity.from('2', 't'),
    },
  };
}

function approvalFor(input: NpcIntentPreparationInput): ApprovalProposal {
  const funding = input.funding!;
  const inventory = input.inventory!;
  const model = input.model!;
  const context = input.officeContext!;
  const payload = {
    schemaVersion: 'npc-intent-preparation-v1',
    candidateKind: 'RESOURCE_ALLOCATION_COMMAND_INTENT',
    worldId: input.worldId,
    countryId: input.countryId,
    expectedWorldVersion: input.worldVersion,
    simTime: input.simTime.toCanonicalValue(),
    modelRef: model.modelRef,
    modelVersion: model.modelVersion,
    decisionRef: model.decisionRef,
    officeId: context.officeId,
    authorizationVersion: context.authorizationVersion,
    fundingSourceRef: funding.sourceRef,
    fundingAccountId: funding.account.accountId,
    availableCash: funding.availableCash.toCanonicalValue(),
    remainingBudget: funding.remainingBudget.toCanonicalValue(),
    requestedSpend: funding.requestedSpend.toCanonicalValue(),
    inventorySourceRef: inventory.sourceRef,
    inventoryAccount: inventory.account,
    availableInventory: inventory.available.toCanonicalValue(),
    requestedInventory: inventory.requested.toCanonicalValue(),
  };
  return {
    id: proposalId('PROPOSAL_NPC_TEST'),
    version: 'V1',
    worldId: WORLD,
    countryId: COUNTRY,
    payloadFingerprint: canonicalSha256(canonicalSerialize(payload), sha256),
    policyVersion: 'TEST_POLICY_V1',
    requiredOffices: [INDUSTRY],
    signatures: [
      {
        officeId: INDUSTRY,
        actorId: actorId('ACTOR_INDUSTRY'),
        authSubject: SUBJECT,
        authorizationVersion: 'AUTH_V1',
        signedAt: '2026-09-24T00:00:00.000Z',
      },
    ],
    status: 'APPROVED',
    supersedesId: null,
    rejectedByOfficeId: null,
  };
}

async function approvedInput(): Promise<NpcIntentPreparationInput> {
  const input = await baseInput();
  return { ...input, approval: approvalFor(input) };
}

describe('V27.3 non-authoritative NPC intent preparation', () => {
  it('produces a stable candidate only, not an executable command or posting', async () => {
    const input = await approvedInput();
    const first = prepareNpcResourceAllocationIntent(input, sha256);
    const replay = prepareNpcResourceAllocationIntent(input, sha256);
    expect(first).toEqual(replay);
    expect(first.status).toBe('CANDIDATE_ONLY');
    if (first.status !== 'CANDIDATE_ONLY') return;
    expect(first.fingerprint).toBe(canonicalSha256(first.hashInput, sha256));
    expect(first.requiredAuthoritativeChecks).toEqual([
      'COMMAND_AUTHORIZATION',
      'APPROVAL_AT_COMMIT',
      'FUNDING_AT_COMMIT',
      'INVENTORY_AT_COMMIT',
      'WORLD_VERSION_AT_COMMIT',
    ]);
    expect(first).not.toHaveProperty('command');
    expect(first).not.toHaveProperty('event');
    expect(first).not.toHaveProperty('posting');
    expect(first.intent).not.toHaveProperty('commandId');
    expect(first.intent).not.toHaveProperty('actorId');
  });

  it('detaches and freezes nested caller inventory after return without changing replay bytes', async () => {
    const input = await approvedInput();
    const result = prepareNpcResourceAllocationIntent(input, sha256);
    expect(result.status).toBe('CANDIDATE_ONLY');
    if (result.status !== 'CANDIDATE_ONLY') return;
    const returnedAccount = result.intent.inventoryAccount as Record<
      string,
      unknown
    >;
    expect(returnedAccount).not.toBe(input.inventory!.account);
    expect(Object.isFrozen(result.intent)).toBe(true);
    expect(Object.isFrozen(returnedAccount)).toBe(true);
    expect(Object.isFrozen(result.intent.availableCash)).toBe(true);
    const originalHashInput = result.hashInput;
    const originalFingerprint = result.fingerprint;
    const originalBatchId = returnedAccount.batchId;

    Object.assign(input.inventory!.account, {
      batchId: inventoryBatchId('BATCH_CHANGED_AFTER_RETURN'),
    });
    expect(input.inventory!.account.batchId).not.toBe(originalBatchId);
    expect(returnedAccount.batchId).toBe(originalBatchId);
    expect(() =>
      Object.assign(returnedAccount, {
        batchId: inventoryBatchId('BATCH_FORGED_RETURNED'),
      }),
    ).toThrow();
    expect(canonicalSerialize(result.intent)).toBe(originalHashInput);
    expect(result.fingerprint).toBe(originalFingerprint);
    expect(result.fingerprint).toBe(
      canonicalSha256(canonicalSerialize(result.intent), sha256),
    );
  });

  it('fails closed for missing model, authorization, approval, funding and stock', async () => {
    const input = await approvedInput();
    for (const [field, reason] of [
      ['model', 'MODEL_UNAVAILABLE'],
      ['officeContext', 'AUTHORIZATION_UNAVAILABLE'],
      ['approval', 'APPROVAL_UNAVAILABLE'],
      ['funding', 'FUNDING_UNAVAILABLE'],
      ['inventory', 'INVENTORY_UNAVAILABLE'],
    ] as const) {
      expect(
        prepareNpcResourceAllocationIntent({ ...input, [field]: null }, sha256),
      ).toEqual({ status: 'UNAVAILABLE', reason });
    }
  });

  it('rejects stale and cross-country facts rather than inventing resources', async () => {
    const input = await approvedInput();
    expect(
      prepareNpcResourceAllocationIntent(
        { ...input, inventory: { ...input.inventory!, worldVersion: '3' } },
        sha256,
      ),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'VERSION_CONFLICT' });
    expect(
      prepareNpcResourceAllocationIntent(
        { ...input, countryId: countryId('OTHER_COUNTRY') },
        sha256,
      ),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'AUTHORIZATION_UNAVAILABLE' });
    expect(
      prepareNpcResourceAllocationIntent(
        {
          ...input,
          funding: {
            ...input.funding!,
            availableCash: Money.from('9.1999', 'GCU'),
          },
        },
        sha256,
      ),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'INSUFFICIENT_BUDGET' });
    expect(
      prepareNpcResourceAllocationIntent(
        {
          ...input,
          funding: {
            ...input.funding!,
            remainingBudget: Money.from('9.1999', 'GCU'),
          },
        },
        sha256,
      ),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'INSUFFICIENT_BUDGET' });
    expect(
      prepareNpcResourceAllocationIntent(
        {
          ...input,
          inventory: {
            ...input.inventory!,
            available: Quantity.from('1.9999', 't'),
          },
        },
        sha256,
      ),
    ).toEqual({ status: 'UNAVAILABLE', reason: 'INSUFFICIENT_INVENTORY' });
  });

  it('allows exact budget and stock equality without rounding', async () => {
    const initial = await baseInput();
    const input = {
      ...initial,
      funding: {
        ...initial.funding!,
        availableCash: Money.from('9.2', 'GCU'),
        remainingBudget: Money.from('9.2', 'GCU'),
      },
      inventory: {
        ...initial.inventory!,
        available: Quantity.from('2', 't'),
      },
    };
    expect(
      prepareNpcResourceAllocationIntent(
        { ...input, approval: approvalFor(input) },
        sha256,
      ).status,
    ).toBe('CANDIDATE_ONLY');
  });

  it('rejects mismatched currency, units, holder, reserved inventory and approval', async () => {
    const input = await approvedInput();
    const cases = [
      {
        change: {
          funding: {
            ...input.funding!,
            remainingBudget: Money.from('100', 'USD'),
          },
        },
        reason: 'FUNDING_UNAVAILABLE',
      },
      {
        change: {
          inventory: {
            ...input.inventory!,
            available: Quantity.from('100', 'kg'),
          },
        },
        reason: 'INVENTORY_UNAVAILABLE',
      },
      {
        change: {
          inventory: {
            ...input.inventory!,
            account: {
              ...input.inventory!.account,
              bucket: 'RESERVED' as const,
            },
          },
        },
        reason: 'INVENTORY_UNAVAILABLE',
      },
      {
        change: {
          inventory: {
            ...input.inventory!,
            account: {
              ...input.inventory!.account,
              titleHolderId: legalEntityId('ANOTHER_OWNER'),
            },
          },
        },
        reason: 'INVENTORY_UNAVAILABLE',
      },
      {
        change: {
          approval: { ...input.approval!, status: 'PENDING' as const },
        },
        reason: 'APPROVAL_UNAVAILABLE',
      },
      {
        change: {
          approval: {
            ...input.approval!,
            payloadFingerprint: `sha256:${'0'.repeat(64)}`,
          },
        },
        reason: 'APPROVAL_UNAVAILABLE',
      },
      {
        change: {
          approval: {
            ...input.approval!,
            signatures: [
              {
                ...input.approval!.signatures[0]!,
                authorizationVersion: 'STALE_AUTH',
              },
            ],
          },
        },
        reason: 'APPROVAL_UNAVAILABLE',
      },
    ];
    for (const { change, reason } of cases) {
      expect(
        prepareNpcResourceAllocationIntent({ ...input, ...change }, sha256),
      ).toEqual({ status: 'UNAVAILABLE', reason });
    }
  });
});
