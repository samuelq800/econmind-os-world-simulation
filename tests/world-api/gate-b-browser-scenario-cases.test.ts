import { describe, expect, it } from 'vitest';

import { DOMAIN_ERROR_CODES, authorizeOfficeCapability } from '@econmind/core';
import { parseWorldReadRequest } from '../../apps/world-api/src/index.js';
import {
  GATE_B_BROWSER_CASE_STATUS,
  createGateBBrowserScenarioCases,
} from '../support/gate-b-browser-scenario-cases.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';

describe('Gate B browser acceptance input cases (not E2E evidence)', () => {
  it('reuses the sole V10 two-country World fixture and remains NOT_RUN', () => {
    const fixture = createV10TwoCountryTestFixture();
    const cases = createGateBBrowserScenarioCases(fixture);
    expect(cases.worldId).toBe(fixture.worldId);
    expect(cases.openingWorldVersion).toBe(fixture.openingWorldVersion);
    expect(cases.fixtureStatus).toBe(fixture.status);
    expect(cases.status).toBe(GATE_B_BROWSER_CASE_STATUS);
    expect(cases.scenarios.map(({ id }) => id)).toEqual([
      'TWO_COUNTRY_TWO_OFFICE_AUTHORIZATION',
      'AUTHORIZED_READ_PROJECTION',
      'COMMAND_RECEIPT_SUCCESS_AND_FAILURE',
      'REFRESH_DISCONNECT_NO_REGRESSION',
    ]);
    expect(cases.scenarios.every(({ status }) => status === 'NOT_RUN')).toBe(
      true,
    );
    expect(createGateBBrowserScenarioCases()).toEqual(cases);
    expect(Object.isFrozen(cases)).toBe(true);
  });

  it('carries distinct seller/buyer identities, Office scopes and live revisions', async () => {
    const fixture = createV10TwoCountryTestFixture();
    const cases = createGateBBrowserScenarioCases(fixture);
    const [auth] = cases.scenarios;
    expect(auth.allow).toHaveLength(3);
    expect(auth.deny).toHaveLength(2);
    expect(cases.actors.sellerTrade.identity).toMatchObject({
      authSubjectId: fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
      authorizationRevision: 'AUTH_V10_SELLER_TRADE_1',
    });
    expect(cases.actors.buyerTrade.identity.authSubjectId).toBe(
      cases.actors.buyerFinance.identity.authSubjectId,
    );
    expect(cases.actors.buyerTrade.identity.officeId).toBe('TRADE');
    expect(cases.actors.buyerFinance.identity.officeId).toBe('FINANCE');
    expect(cases.actors.buyerFinance.identity.scopeKey).toBe(
      'COUNTRY_BUYER_TEST_FINANCE',
    );
    expect(auth.revokedRevision).toMatchObject({
      oldRevision: 'AUTH_V10_SELLER_TRADE_1',
      newRevision: 'AUTH_V10_SELLER_TRADE_2',
      oldScopeMustNotRemainReadable: true,
    });
    for (const negative of auth.deny) {
      const actor = fixture.officeActors[negative.actorKey];
      await expect(
        authorizeOfficeCapability({
          principal: actor.principal,
          resolver: actor.resolver,
          worldId: fixture.worldId,
          requestedCountryId: negative.requestedCountryId,
          requestedOfficeId: negative.requestedOfficeId,
          capability: negative.capability,
        }),
      ).rejects.toMatchObject({
        code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      });
    }
  });

  it('specifies actual server-read requests, opening and post-commit versions, and denied cross-country read', () => {
    const cases = createGateBBrowserScenarioCases();
    const [, read] = cases.scenarios;
    expect(read.requiredSource).toBe('MANAGED_POSTGRES_READ_MODEL');
    expect(read.serverProjectionAndEntitlementMustExist).toBe(true);
    expect(read.reads.map(({ actorKey }) => actorKey)).toEqual([
      'sellerTrade',
      'buyerTrade',
      'buyerFinance',
    ]);
    for (const entry of read.reads) {
      expect(parseWorldReadRequest(entry.request)).toEqual(entry.request);
      expect(entry.request.payload.worldId).toBe(cases.worldId);
      expect(entry.expectedWorldVersion).toBe('0');
      expect(entry.expectedAuthorizationRevision).toBe(
        cases.actors[entry.actorKey].identity.authorizationRevision,
      );
    }
    expect(read.reads[2]?.request.payload).toMatchObject({
      classification: 'OFFICE_PRIVATE',
      scopeKey: 'COUNTRY_BUYER_TEST_FINANCE',
    });
    expect(read.deniedRead).toMatchObject({
      actorKey: 'sellerTrade',
      expected: 'NO_PROJECTION',
      allowedServerErrorCodes: ['NOT_FOUND', 'AUTHORIZATION_DENIED'],
    });
    expect(read.deniedRead.request.payload.scopeKey).toBe(
      cases.actors.buyerTrade.identity.countryId,
    );
    expect(read.afterCommit).toEqual({
      minimumWorldVersion: '1',
      requiredSource: 'SERVER_PROJECTION_WATERMARK',
      noFixtureVersionSubstitution: true,
    });
  });

  it('keeps narrow API command distinct from the canonical goods-transfer command and requires real approval/receipt', () => {
    const fixture = createV10TwoCountryTestFixture();
    const cases = createGateBBrowserScenarioCases(fixture);
    const [, , receipt] = cases.scenarios;
    expect(receipt.actorKey).toBe('sellerTrade');
    expect(receipt.request.payload).toMatchObject({
      worldId: fixture.worldId,
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
      commandId: receipt.draft.commandId,
      idempotencyKey: receipt.draft.idempotencyKey,
      buyerCountryId: fixture.countries.buyer,
    });
    expect(receipt.request.operation).toBe(
      'SUBMIT_NARROW_TREASURY_GCU_TRANSFER',
    );
    expect(receipt.draft.expectedWorldVersion).toBe('0');
    expect(receipt.request.payload.commandId).not.toBe(
      fixture.command.commandId,
    );
    expect(receipt.unrelatedCanonicalGoodsTransferCommandId).toBe(
      fixture.command.commandId,
    );
    expect(receipt.buyerFinanceApprovalPrerequisite).toMatchObject({
      actorKey: 'buyerFinance',
      expectedAuthorizationRevision: 'AUTH_V10_BUYER_1',
      mustBeVerifiedCurrentOnServer: true,
      fixtureProvidesApprovalRow: false,
    });
    expect(receipt.serverPreconditions).toEqual({
      exclusiveWorldVersionBefore: '0',
      narrowProposalMustExist: true,
      durableReceiptPortMustBeBound: true,
    });
    expect(receipt.expectedCommitted).toEqual({
      source: 'DURABLE_FINAL_COMMAND_RECEIPT',
      outcome: 'COMMITTED',
      worldVersionAfter: '1',
      eventIds: 'NONEMPTY_SERVER_IDS',
      postCommitReadMinimumWorldVersion: '1',
    });
    expect(receipt.negativeCases.map(({ kind }) => kind)).toEqual([
      'MISSING_BUYER_FINANCE_APPROVAL',
      'WRONG_COUNTRY',
    ]);
    expect(receipt.negativeCases[0]).toMatchObject({
      request: receipt.request,
      serverApprovalState: 'ABSENT',
      noDurableCommit: true,
    });
    expect(receipt.negativeCases[1]?.request.payload.countryId).toBe(
      fixture.countries.buyer,
    );
  });

  it('requires same-ID recovery after UNKNOWN, monotonic version and cache scope isolation', () => {
    const cases = createGateBBrowserScenarioCases();
    const [, , receipt, reconnect] = cases.scenarios;
    expect(reconnect.initialWorldVersion).toBe('0');
    expect(reconnect.committedWorldVersion).toBe('1');
    expect(reconnect.expectedLostAcknowledgementResult).toBe('UNKNOWN');
    expect(reconnect.retry).toMatchObject({
      commandId: receipt.draft.commandId,
      idempotencyKey: receipt.draft.idempotencyKey,
      request: receipt.request,
      onlyAfterReconnectAndServerReconciliation: true,
      neverReplaceCommandIdentity: true,
      expectedFinalReceiptSource: 'DURABLE_FINAL_COMMAND_RECEIPT',
    });
    expect(reconnect.negativeCases.map(({ kind }) => kind)).toEqual([
      'LOWER_WORLD_VERSION_AFTER_COMMIT',
      'CHANGED_AUTHORIZATION_REVISION',
      'CROSS_COUNTRY_CACHE_REUSE',
      'NEW_COMMAND_ID_WHILE_UNKNOWN',
    ]);
    expect(reconnect.negativeCases).toMatchObject([
      { receivedWorldVersion: '0' },
      { newRevision: 'AUTH_V10_SELLER_TRADE_2' },
      { foreignIdentity: cases.actors.buyerTrade.identity },
      { attemptedCommandId: 'COMMAND_GATE_B_NARROW_TRANSFER_2' },
    ]);
  });
});
