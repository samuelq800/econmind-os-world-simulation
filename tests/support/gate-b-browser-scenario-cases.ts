import {
  WORLD_PROJECTION_SCHEMA_VERSION,
  createWorldReadRequest,
  type NarrowTransferCommandRequest,
  type WorldReadRequestEnvelope,
} from '../../apps/world-api/src/index.js';
import type {
  AuthorizedBrowserIdentity,
  NarrowTransferDraft,
} from '../../apps/world-web/src/authorized-client/client.js';

import {
  V10_TWO_COUNTRY_TEST_FIXTURE_STATUS,
  createV10TwoCountryTestFixture,
  type V10FixtureActorKey,
  type V10TwoCountryTestFixture,
} from './v10-two-country-fixture.js';

/** Declarative inputs/assertions only. No server result, JWT, or Gate B evidence. */
export const GATE_B_BROWSER_CASE_STATUS = 'NOT_RUN' as const;
export const GATE_B_BROWSER_CASE_VERSION = 'GATE_B_BROWSER_CASES_V1' as const;

type FixtureAuthorizationCase =
  V10TwoCountryTestFixture['authorizationCases'][number];
type ActorCase = Readonly<{
  actorKey: V10FixtureActorKey;
  identity: AuthorizedBrowserIdentity;
  expectedWorldVersion: string;
}>;

export interface BrowserAuthorizationScenario {
  readonly id: 'TWO_COUNTRY_TWO_OFFICE_AUTHORIZATION';
  readonly status: typeof GATE_B_BROWSER_CASE_STATUS;
  readonly allow: readonly FixtureAuthorizationCase[];
  readonly deny: readonly FixtureAuthorizationCase[];
  readonly expectedDenial: 'AUTHORIZATION_DENIED';
  readonly revokedRevision: Readonly<{
    actorKey: 'sellerTrade';
    oldRevision: string;
    newRevision: 'AUTH_V10_SELLER_TRADE_2';
    oldScopeMustNotRemainReadable: true;
  }>;
}

export interface BrowserReadProjectionScenario {
  readonly id: 'AUTHORIZED_READ_PROJECTION';
  readonly status: typeof GATE_B_BROWSER_CASE_STATUS;
  readonly requiredSource: 'MANAGED_POSTGRES_READ_MODEL';
  readonly serverProjectionAndEntitlementMustExist: true;
  readonly reads: readonly Readonly<{
    actorKey: V10FixtureActorKey;
    request: WorldReadRequestEnvelope;
    expectedWorldVersion: string;
    expectedAuthorizationRevision: string;
  }>[];
  readonly deniedRead: Readonly<{
    actorKey: 'sellerTrade';
    request: WorldReadRequestEnvelope;
    expected: 'NO_PROJECTION';
    allowedServerErrorCodes: readonly ['NOT_FOUND', 'AUTHORIZATION_DENIED'];
  }>;
  readonly afterCommit: Readonly<{
    minimumWorldVersion: string;
    requiredSource: 'SERVER_PROJECTION_WATERMARK';
    noFixtureVersionSubstitution: true;
  }>;
}

export interface BrowserFinalReceiptScenario {
  readonly id: 'COMMAND_RECEIPT_SUCCESS_AND_FAILURE';
  readonly status: typeof GATE_B_BROWSER_CASE_STATUS;
  readonly actorKey: 'sellerTrade';
  readonly draft: NarrowTransferDraft;
  readonly request: NarrowTransferCommandRequest;
  readonly buyerFinanceApprovalPrerequisite: Readonly<{
    actorKey: 'buyerFinance';
    expectedAuthorizationRevision: string;
    approvalRef: string;
    mustBeVerifiedCurrentOnServer: true;
    fixtureProvidesApprovalRow: false;
  }>;
  readonly serverPreconditions: Readonly<{
    exclusiveWorldVersionBefore: string;
    narrowProposalMustExist: true;
    durableReceiptPortMustBeBound: true;
  }>;
  readonly expectedCommitted: Readonly<{
    source: 'DURABLE_FINAL_COMMAND_RECEIPT';
    outcome: 'COMMITTED';
    worldVersionAfter: string;
    eventIds: 'NONEMPTY_SERVER_IDS';
    postCommitReadMinimumWorldVersion: string;
  }>;
  readonly negativeCases: readonly (
    | Readonly<{
        kind: 'MISSING_BUYER_FINANCE_APPROVAL';
        request: NarrowTransferCommandRequest;
        serverApprovalState: 'ABSENT';
        expected: 'AUTHORIZATION_DENIED';
        noDurableCommit: true;
      }>
    | Readonly<{
        kind: 'WRONG_COUNTRY';
        request: NarrowTransferCommandRequest;
        serverApprovalState: 'APPROVED';
        expected: 'AUTHORIZATION_DENIED';
        noDurableCommit: true;
      }>
  )[];
  readonly unrelatedCanonicalGoodsTransferCommandId: string;
}

export interface BrowserReconnectScenario {
  readonly id: 'REFRESH_DISCONNECT_NO_REGRESSION';
  readonly status: typeof GATE_B_BROWSER_CASE_STATUS;
  readonly actorKey: 'sellerTrade';
  readonly initialWorldVersion: string;
  readonly committedWorldVersion: string;
  readonly expectedLostAcknowledgementResult: 'UNKNOWN';
  readonly retry: Readonly<{
    commandId: string;
    idempotencyKey: string;
    request: NarrowTransferCommandRequest;
    onlyAfterReconnectAndServerReconciliation: true;
    neverReplaceCommandIdentity: true;
    expectedFinalReceiptSource: 'DURABLE_FINAL_COMMAND_RECEIPT';
  }>;
  readonly negativeCases: readonly (
    | Readonly<{
        kind: 'LOWER_WORLD_VERSION_AFTER_COMMIT';
        receivedWorldVersion: string;
        expected: 'REJECT_OR_KEEP_UNAVAILABLE';
      }>
    | Readonly<{
        kind: 'CHANGED_AUTHORIZATION_REVISION';
        newRevision: string;
        expected: 'REJECT_OR_KEEP_UNAVAILABLE';
      }>
    | Readonly<{
        kind: 'CROSS_COUNTRY_CACHE_REUSE';
        foreignIdentity: AuthorizedBrowserIdentity;
        expected: 'REJECT_OR_KEEP_UNAVAILABLE';
      }>
    | Readonly<{
        kind: 'NEW_COMMAND_ID_WHILE_UNKNOWN';
        attemptedCommandId: 'COMMAND_GATE_B_NARROW_TRANSFER_2';
        expected: 'REJECT_OR_KEEP_UNAVAILABLE';
      }>
  )[];
}

export interface GateBBrowserScenarioCases {
  readonly schemaVersion: typeof GATE_B_BROWSER_CASE_VERSION;
  readonly status: typeof GATE_B_BROWSER_CASE_STATUS;
  readonly fixtureStatus: typeof V10_TWO_COUNTRY_TEST_FIXTURE_STATUS;
  readonly worldId: string;
  readonly openingWorldVersion: string;
  readonly actors: Readonly<Record<V10FixtureActorKey, ActorCase>>;
  readonly scenarios: readonly [
    BrowserAuthorizationScenario,
    BrowserReadProjectionScenario,
    BrowserFinalReceiptScenario,
    BrowserReconnectScenario,
  ];
}

const requestIds = {
  sellerCountry: '550e8400-e29b-41d4-a716-446655440101',
  buyerCountry: '550e8400-e29b-41d4-a716-446655440102',
  buyerFinance: '550e8400-e29b-41d4-a716-446655440103',
  deniedCountry: '550e8400-e29b-41d4-a716-446655440104',
  command: '550e8400-e29b-41d4-a716-446655440105',
} as const;

function actorCase(
  fixture: Readonly<V10TwoCountryTestFixture>,
  actorKey: V10FixtureActorKey,
  classification: AuthorizedBrowserIdentity['classification'],
  scopeKey: string,
): ActorCase {
  const actor = fixture.officeActors[actorKey];
  return Object.freeze({
    actorKey,
    identity: Object.freeze({
      worldId: fixture.worldId,
      authSubjectId: actor.principal.authSubject,
      authorizationRevision: actor.membership.authorizationVersion,
      countryId: actor.membership.countryId,
      officeId: actor.officeId,
      scopeKey,
      modelVersion: 'GATE_B_TEST_MODEL_V1',
      projectionVersion: WORLD_PROJECTION_SCHEMA_VERSION,
      classification,
    }),
    expectedWorldVersion: fixture.openingWorldVersion,
  });
}

/** Reuses C's World, countries, actors, command baseline and opening version. */
export function createGateBBrowserScenarioCases(
  fixture: Readonly<V10TwoCountryTestFixture> = createV10TwoCountryTestFixture(),
): GateBBrowserScenarioCases {
  if (
    fixture.status !== V10_TWO_COUNTRY_TEST_FIXTURE_STATUS ||
    fixture.openingWorldVersion !== '0' ||
    fixture.rebuiltLedgers.worldVersion !== fixture.openingWorldVersion
  ) {
    throw new Error('GATE_B_BROWSER_CASE_FIXTURE_MISMATCH');
  }
  const actors = Object.freeze({
    sellerTrade: actorCase(
      fixture,
      'sellerTrade',
      'COUNTRY',
      fixture.countries.seller,
    ),
    buyerTrade: actorCase(
      fixture,
      'buyerTrade',
      'COUNTRY',
      fixture.countries.buyer,
    ),
    // Country-qualified Office key: TRADE/FINANCE alone is not globally unique.
    buyerFinance: actorCase(
      fixture,
      'buyerFinance',
      'OFFICE_PRIVATE',
      `${fixture.countries.buyer}_FINANCE`,
    ),
  });
  const committedVersion = (
    BigInt(fixture.openingWorldVersion) + 1n
  ).toString();
  const proposalRef = 'PROPOSAL_GATE_B_NARROW_1';
  const buyerFinanceApprovalRef = 'APPROVAL_GATE_B_BUYER_FINANCE_1';
  const draft: NarrowTransferDraft = Object.freeze({
    commandId: 'COMMAND_GATE_B_NARROW_TRANSFER_1',
    idempotencyKey: 'IDEMPOTENCY_GATE_B_NARROW_TRANSFER_1',
    expectedWorldVersion: fixture.openingWorldVersion,
    proposalRef,
    buyerCountryId: fixture.countries.buyer,
    buyerFinanceApprovalRef,
  });
  // E's narrow-transfer wire is not C's CORE_GOODS_TRANSFER_V1 command.
  const commandRequest: NarrowTransferCommandRequest = Object.freeze({
    schemaVersion: 'world-command-api-v2',
    requestId: requestIds.command,
    operation: 'SUBMIT_NARROW_TREASURY_GCU_TRANSFER',
    payload: Object.freeze({
      worldId: fixture.worldId,
      countryId: fixture.countries.seller,
      officeId: actors.sellerTrade.identity.officeId,
      commandId: draft.commandId,
      idempotencyKey: draft.idempotencyKey,
      expectedWorldVersion: draft.expectedWorldVersion,
      proposalRef,
      buyerCountryId: fixture.countries.buyer,
      buyerFinanceApprovalRef,
    }),
  });
  const auth: BrowserAuthorizationScenario = Object.freeze({
    id: 'TWO_COUNTRY_TWO_OFFICE_AUTHORIZATION',
    status: GATE_B_BROWSER_CASE_STATUS,
    allow: Object.freeze(
      fixture.authorizationCases.filter((entry) => entry.expected === 'ALLOW'),
    ),
    deny: Object.freeze(
      fixture.authorizationCases.filter((entry) => entry.expected === 'DENY'),
    ),
    expectedDenial: 'AUTHORIZATION_DENIED',
    revokedRevision: Object.freeze({
      actorKey: 'sellerTrade',
      oldRevision: actors.sellerTrade.identity.authorizationRevision,
      newRevision: 'AUTH_V10_SELLER_TRADE_2',
      oldScopeMustNotRemainReadable: true,
    }),
  });
  const read: BrowserReadProjectionScenario = Object.freeze({
    id: 'AUTHORIZED_READ_PROJECTION',
    status: GATE_B_BROWSER_CASE_STATUS,
    requiredSource: 'MANAGED_POSTGRES_READ_MODEL',
    serverProjectionAndEntitlementMustExist: true,
    reads: Object.freeze(
      (
        [
          ['sellerTrade', requestIds.sellerCountry],
          ['buyerTrade', requestIds.buyerCountry],
          ['buyerFinance', requestIds.buyerFinance],
        ] as const
      ).map(([actorKey, requestId]) => {
        const identity = actors[actorKey].identity;
        return Object.freeze({
          actorKey,
          request: createWorldReadRequest({
            requestId,
            worldId: fixture.worldId,
            classification: identity.classification,
            scopeKey: identity.scopeKey,
          }),
          expectedWorldVersion: fixture.openingWorldVersion,
          expectedAuthorizationRevision: identity.authorizationRevision,
        });
      }),
    ),
    deniedRead: Object.freeze({
      actorKey: 'sellerTrade',
      request: createWorldReadRequest({
        requestId: requestIds.deniedCountry,
        worldId: fixture.worldId,
        classification: 'COUNTRY',
        scopeKey: fixture.countries.buyer,
      }),
      expected: 'NO_PROJECTION',
      allowedServerErrorCodes: Object.freeze([
        'NOT_FOUND',
        'AUTHORIZATION_DENIED',
      ] as const),
    }),
    afterCommit: Object.freeze({
      minimumWorldVersion: committedVersion,
      requiredSource: 'SERVER_PROJECTION_WATERMARK',
      noFixtureVersionSubstitution: true,
    }),
  });
  const receipt: BrowserFinalReceiptScenario = Object.freeze({
    id: 'COMMAND_RECEIPT_SUCCESS_AND_FAILURE',
    status: GATE_B_BROWSER_CASE_STATUS,
    actorKey: 'sellerTrade',
    draft,
    request: commandRequest,
    buyerFinanceApprovalPrerequisite: Object.freeze({
      actorKey: 'buyerFinance',
      expectedAuthorizationRevision:
        actors.buyerFinance.identity.authorizationRevision,
      approvalRef: buyerFinanceApprovalRef,
      mustBeVerifiedCurrentOnServer: true,
      fixtureProvidesApprovalRow: false,
    }),
    serverPreconditions: Object.freeze({
      exclusiveWorldVersionBefore: fixture.openingWorldVersion,
      narrowProposalMustExist: true,
      durableReceiptPortMustBeBound: true,
    }),
    expectedCommitted: Object.freeze({
      source: 'DURABLE_FINAL_COMMAND_RECEIPT',
      outcome: 'COMMITTED',
      worldVersionAfter: committedVersion,
      eventIds: 'NONEMPTY_SERVER_IDS',
      postCommitReadMinimumWorldVersion: committedVersion,
    }),
    negativeCases: Object.freeze([
      Object.freeze({
        kind: 'MISSING_BUYER_FINANCE_APPROVAL',
        request: commandRequest,
        serverApprovalState: 'ABSENT',
        expected: 'AUTHORIZATION_DENIED',
        noDurableCommit: true,
      }),
      Object.freeze({
        kind: 'WRONG_COUNTRY',
        request: Object.freeze({
          ...commandRequest,
          payload: Object.freeze({
            ...commandRequest.payload,
            countryId: fixture.countries.buyer,
          }),
        }),
        serverApprovalState: 'APPROVED',
        expected: 'AUTHORIZATION_DENIED',
        noDurableCommit: true,
      }),
    ]),
    unrelatedCanonicalGoodsTransferCommandId: fixture.command.commandId,
  });
  const reconnect: BrowserReconnectScenario = Object.freeze({
    id: 'REFRESH_DISCONNECT_NO_REGRESSION',
    status: GATE_B_BROWSER_CASE_STATUS,
    actorKey: 'sellerTrade',
    initialWorldVersion: fixture.openingWorldVersion,
    committedWorldVersion: committedVersion,
    expectedLostAcknowledgementResult: 'UNKNOWN',
    retry: Object.freeze({
      commandId: draft.commandId,
      idempotencyKey: draft.idempotencyKey,
      request: commandRequest,
      onlyAfterReconnectAndServerReconciliation: true,
      neverReplaceCommandIdentity: true,
      expectedFinalReceiptSource: 'DURABLE_FINAL_COMMAND_RECEIPT',
    }),
    negativeCases: Object.freeze([
      Object.freeze({
        kind: 'LOWER_WORLD_VERSION_AFTER_COMMIT',
        receivedWorldVersion: fixture.openingWorldVersion,
        expected: 'REJECT_OR_KEEP_UNAVAILABLE',
      }),
      Object.freeze({
        kind: 'CHANGED_AUTHORIZATION_REVISION',
        newRevision: auth.revokedRevision.newRevision,
        expected: 'REJECT_OR_KEEP_UNAVAILABLE',
      }),
      Object.freeze({
        kind: 'CROSS_COUNTRY_CACHE_REUSE',
        foreignIdentity: actors.buyerTrade.identity,
        expected: 'REJECT_OR_KEEP_UNAVAILABLE',
      }),
      Object.freeze({
        kind: 'NEW_COMMAND_ID_WHILE_UNKNOWN',
        attemptedCommandId: 'COMMAND_GATE_B_NARROW_TRANSFER_2',
        expected: 'REJECT_OR_KEEP_UNAVAILABLE',
      }),
    ]),
  });
  return Object.freeze({
    schemaVersion: GATE_B_BROWSER_CASE_VERSION,
    status: GATE_B_BROWSER_CASE_STATUS,
    fixtureStatus: fixture.status,
    worldId: fixture.worldId,
    openingWorldVersion: fixture.openingWorldVersion,
    actors,
    scenarios: Object.freeze([auth, read, receipt, reconnect] as const),
  });
}
