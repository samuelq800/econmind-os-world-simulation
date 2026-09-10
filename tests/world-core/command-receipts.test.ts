import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  SimTime,
  acceptCanonicalCommand,
  authSubject,
  authorizeOfficeCapability,
  createAuthoritativeTransition,
  classifyCommandIdentity,
  countryId,
  createEventConsumerReceipt,
  createFinalCommandReceipt,
  createOutboxMessage,
  eventId,
  isCommitAuthorizationProof,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  processQueuedCommand,
  reauthorizeOfficeCapability,
  recordConsumerDelivery,
  recordOutboxDeliveryAttempt,
  teamId,
  worldId,
  type AuthenticatedPrincipal,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type CommandAcceptance,
  type CommandIntakeResponse,
  type DurableCommandIntakePort,
  type FinalCommandReceipt,
  type MembershipSnapshot,
} from '../../packages/core/src/index.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

function commandInput(overrides: Record<string, unknown> = {}) {
  return {
    actorId: 'ACTOR_1',
    authSubject: '11111111-1111-4111-8111-111111111111',
    commandId: 'COMMAND_1',
    commandType: 'TRANSFER_REQUESTED',
    correlationId: 'CORRELATION_1',
    countryId: 'COUNTRY_1',
    expectedWorldVersion: '0',
    idempotencyKey: 'TRANSFER_1',
    officeId: 'TRADE',
    payload: { amount: '10', asset: 'GCU' },
    schemaVersion: COMMAND_SCHEMA_VERSION,
    simTime: '10000',
    submittedAtReal: '2026-09-10T00:00:00.000Z',
    worldId: 'WORLD_1',
    ...overrides,
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return parseCanonicalCommand(commandInput(overrides), sha256);
}

function committedReceipt(value: CanonicalCommand): FinalCommandReceipt {
  return committedResult(value).receipt;
}

function transition(
  value: CanonicalCommand,
  input: {
    readonly worldVersionBefore?: string;
    readonly worldVersionAfter?: string;
    readonly eventIds?: readonly string[];
  } = {},
): AuthoritativeTransition {
  const worldVersionBefore = input.worldVersionBefore ?? '0';
  const worldVersionAfter = input.worldVersionAfter ?? '1';
  const events = (input.eventIds ?? ['EVENT_1']).map((identity, index) =>
    parseAuthoritativeEvent(
      {
        causationCommandId: value.commandId,
        correlationId: value.correlationId,
        correctsEventId: null,
        eventId: identity,
        eventType: 'TRANSFER_RECORDED',
        payload: { amount: '10', asset: 'GCU', leg: String(index + 1) },
        recordedAtReal: '2026-09-10T00:00:01.000Z',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sequence: String(index + 1),
        simTime: '10001',
        worldId: value.worldId,
        worldVersion: worldVersionAfter,
      },
      sha256,
    ),
  );
  return createAuthoritativeTransition({
    command: value,
    worldVersionBefore,
    worldVersionAfter,
    events,
  });
}

function committedResult(value: CanonicalCommand) {
  const authoritativeTransition = transition(value);
  const receipt = createFinalCommandReceipt({
    command: value,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition: authoritativeTransition,
    simTime: SimTime.fromTicks('10001'),
    recordedAtReal: '2026-09-10T00:00:01.000Z',
  });
  return Object.freeze({ receipt, transition: authoritativeTransition });
}

class TestDurableIntake implements DurableCommandIntakePort {
  private accepted:
    | Readonly<{
        command: CanonicalCommand;
        acknowledgement: CommandAcceptance;
      }>
    | undefined;
  finalReceipt: FinalCommandReceipt | null = null;

  async acceptOrLoad(input: {
    readonly command: CanonicalCommand;
    readonly acknowledgement: CommandAcceptance;
  }): Promise<CommandIntakeResponse> {
    if (this.accepted === undefined) {
      this.accepted = Object.freeze(input);
      return Object.freeze({
        kind: 'ACCEPTED',
        acknowledgement: input.acknowledgement,
      });
    }
    classifyCommandIdentity([this.accepted.command], input.command);
    return Object.freeze({
      kind: 'EXACT_DUPLICATE',
      acknowledgement: this.accepted.acknowledgement,
      finalReceipt: this.finalReceipt,
    });
  }
}

function authorizationFixture(
  input: {
    readonly world?: string;
    readonly country?: string;
    readonly office?: 'TRADE' | 'FINANCE';
  } = {},
) {
  const principal: AuthenticatedPrincipal = Object.freeze({
    authSubject: authSubject('11111111-1111-4111-8111-111111111111'),
    facts: Object.freeze({
      user_id: '11111111-1111-4111-8111-111111111111',
      display_name: 'Trade actor',
      school_id: null,
    }),
    token: Object.freeze({
      subject: '11111111-1111-4111-8111-111111111111',
      issuer: 'test',
      audience: 'world',
      issuedAt: '2026-09-10T00:00:00.000Z',
      expiresAt: '2026-09-10T01:00:00.000Z',
    }),
  });
  let membership: MembershipSnapshot | null = Object.freeze({
    authorizationVersion: '1',
    authSubject: principal.authSubject,
    worldId: worldId(input.world ?? 'WORLD_1'),
    teamId: teamId('TEAM_1'),
    countryId: countryId(input.country ?? 'COUNTRY_1'),
    officeAssignments: Object.freeze([
      input.office === 'FINANCE'
        ? command({ officeId: 'FINANCE' }).officeId!
        : command().officeId!,
    ]),
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: Object.freeze([]),
  });
  const resolver = {
    async resolveCurrentIdentity() {
      return membership === null ? null : principal.authSubject;
    },
    async resolveCurrentMembership() {
      return membership;
    },
  };
  return {
    principal,
    resolver,
    revoke: () => {
      membership = null;
    },
    revise: () => {
      if (membership !== null) {
        membership = Object.freeze({
          ...membership,
          authorizationVersion: '2',
        });
      }
    },
  };
}

describe('V07.2 accepted/executed and durable duplicate contract', () => {
  it('returns the original acknowledgement/final receipt for an exact trace-only retry', async () => {
    const store = new TestDurableIntake();
    const original = command();
    const accepted = await acceptCanonicalCommand({
      command: original,
      persistence: store,
    });
    expect(accepted.kind).toBe('ACCEPTED');
    store.finalReceipt = committedReceipt(original);

    const retry = command({
      correlationId: 'CORRELATION_RETRY',
      submittedAtReal: '2026-09-10T00:00:02.000Z',
    });
    const duplicate = await acceptCanonicalCommand({
      command: retry,
      persistence: store,
    });
    expect(duplicate).toMatchObject({
      kind: 'EXACT_DUPLICATE',
      acknowledgement: { acceptedAtReal: '2026-09-10T00:00:00.000Z' },
      finalReceipt: { outcome: 'COMMITTED' },
    });
  });

  it('rejects changed authoritative intent under the same identity', async () => {
    const store = new TestDurableIntake();
    await acceptCanonicalCommand({ command: command(), persistence: store });
    await expect(
      acceptCanonicalCommand({
        command: command({ payload: { amount: '11', asset: 'GCU' } }),
        persistence: store,
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT });
  });
});

describe('V07.2 commit-time authorization and recovery boundary', () => {
  it('re-resolves current authority immediately before the commit port', async () => {
    const auth = authorizationFixture();
    const intakeContext = await authorizeOfficeCapability({
      principal: auth.principal,
      resolver: auth.resolver,
      worldId: worldId('WORLD_1'),
      requestedCountryId: countryId('COUNTRY_1'),
      requestedOfficeId: command().officeId!,
      capability: 'TRADE_POLICY',
    });
    auth.revise();
    const order: string[] = [];
    const result = await processQueuedCommand({
      command: command(),
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: SimTime.fromTicks('10001'),
      recordedAtReal: '2026-09-10T00:00:01.000Z',
      requiredCapability: 'TRADE_POLICY',
      reauthorizeAtCommit: async () => {
        order.push('REAUTHORIZE');
        return reauthorizeOfficeCapability(intakeContext);
      },
      persistence: {
        async readFinalReceipt() {
          order.push('READ_FINAL');
          return null;
        },
        async recordZeroEffectReceipt() {
          throw new Error('unexpected zero-effect receipt');
        },
        async commitAuthorizedCommand(input) {
          order.push('COMMIT');
          expect(input.commitAuthorization?.authorizationVersion).toBe('2');
          expect(isCommitAuthorizationProof(input.commitAuthorization)).toBe(
            true,
          );
          return committedResult(input.command);
        },
      },
    });
    expect(order).toEqual(['READ_FINAL', 'REAUTHORIZE', 'COMMIT']);
    expect(result.receipt.outcome).toBe('COMMITTED');
  });

  it('fails revoked pending discretionary work closed with zero effect', async () => {
    const auth = authorizationFixture();
    const intakeContext = await authorizeOfficeCapability({
      principal: auth.principal,
      resolver: auth.resolver,
      worldId: worldId('WORLD_1'),
      requestedCountryId: countryId('COUNTRY_1'),
      requestedOfficeId: command().officeId!,
      capability: 'TRADE_POLICY',
    });
    auth.revoke();
    let commitCalls = 0;
    let recorded: FinalCommandReceipt | null = null;
    const result = await processQueuedCommand({
      command: command(),
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: SimTime.fromTicks('10001'),
      recordedAtReal: '2026-09-10T00:00:01.000Z',
      requiredCapability: 'TRADE_POLICY',
      reauthorizeAtCommit: () => reauthorizeOfficeCapability(intakeContext),
      persistence: {
        async readFinalReceipt() {
          return null;
        },
        async recordZeroEffectReceipt(receipt) {
          recorded = receipt;
          return receipt;
        },
        async commitAuthorizedCommand() {
          commitCalls += 1;
          throw new Error('revoked work reached commit');
        },
      },
    });
    expect(result.receipt).toMatchObject({
      outcome: 'AUTHORIZATION_REVOKED',
      reasonCode: 'AUTHORIZATION_REVOKED',
      worldVersionBefore: null,
      worldVersionAfter: null,
      eventIds: [],
    });
    expect(recorded).toBe(result.receipt);
    expect(commitCalls).toBe(0);
  });

  it.each([
    [
      'another World',
      { world: 'WORLD_2' },
      'TRADE_POLICY' as const,
      'TRADE_POLICY' as const,
    ],
    [
      'another Country',
      { country: 'COUNTRY_2' },
      'TRADE_POLICY' as const,
      'TRADE_POLICY' as const,
    ],
    [
      'another Office',
      { office: 'FINANCE' as const },
      'FINANCE_BUDGET' as const,
      'TRADE_POLICY' as const,
    ],
    [
      'another capability',
      {},
      'TRADE_CONTRACTS' as const,
      'TRADE_POLICY' as const,
    ],
  ])(
    'rejects commit authorization bound to %s before invoking commit',
    async (_label, fixtureInput, issuedCapability, requiredCapability) => {
      const auth = authorizationFixture(fixtureInput);
      const issued = await authorizeOfficeCapability({
        principal: auth.principal,
        resolver: auth.resolver,
        worldId: worldId(fixtureInput.world ?? 'WORLD_1'),
        requestedCountryId: countryId(fixtureInput.country ?? 'COUNTRY_1'),
        requestedOfficeId:
          fixtureInput.office === 'FINANCE'
            ? command({ officeId: 'FINANCE' }).officeId!
            : command().officeId!,
        capability: issuedCapability,
      });
      let commitCalls = 0;
      const result = await processQueuedCommand({
        command: command(),
        authorityKind: 'DISCRETIONARY_USER',
        commitSimTime: SimTime.fromTicks('10001'),
        recordedAtReal: '2026-09-10T00:00:01.000Z',
        requiredCapability,
        reauthorizeAtCommit: () => reauthorizeOfficeCapability(issued),
        persistence: {
          async readFinalReceipt() {
            return null;
          },
          async recordZeroEffectReceipt(receipt) {
            return receipt;
          },
          async commitAuthorizedCommand() {
            commitCalls += 1;
            throw new Error('mismatched authorization reached commit');
          },
        },
      });
      expect(result.receipt).toMatchObject({
        outcome: 'AUTHORIZATION_REVOKED',
        reasonCode: 'AUTHORIZATION_REVOKED',
        eventIds: [],
      });
      expect(commitCalls).toBe(0);
    },
  );

  it('returns an already committed fact without retrospective reauthorization', async () => {
    const original = committedReceipt(command());
    let reauthorizationCalls = 0;
    const result = await processQueuedCommand({
      command: command(),
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: SimTime.fromTicks('10002'),
      recordedAtReal: '2026-09-10T00:00:02.000Z',
      requiredCapability: 'TRADE_POLICY',
      reauthorizeAtCommit: async () => {
        reauthorizationCalls += 1;
        throw new DomainError(
          DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
          'revoked later',
        );
      },
      persistence: {
        async readFinalReceipt() {
          return original;
        },
        async recordZeroEffectReceipt(receipt) {
          return receipt;
        },
        async commitAuthorizedCommand() {
          throw new Error('committed fact was executed again');
        },
      },
    });
    expect(result).toEqual({ source: 'EXISTING_FINAL', receipt: original });
    expect(reauthorizationCalls).toBe(0);
  });

  it('rejects a stored receipt whose fingerprint differs from the queued Command', async () => {
    const original = command();
    const existing = committedReceipt(original);
    let commitCalls = 0;
    await expect(
      processQueuedCommand({
        command: command({ payload: { amount: '11', asset: 'GCU' } }),
        authorityKind: 'DISCRETIONARY_USER',
        commitSimTime: SimTime.fromTicks('10002'),
        recordedAtReal: '2026-09-10T00:00:02.000Z',
        requiredCapability: 'TRADE_POLICY',
        reauthorizeAtCommit: async () => {
          throw new Error('fingerprint conflict must precede authorization');
        },
        persistence: {
          async readFinalReceipt() {
            return existing;
          },
          async recordZeroEffectReceipt(receipt) {
            return receipt;
          },
          async commitAuthorizedCommand() {
            commitCalls += 1;
            throw new Error('fingerprint conflict reached commit');
          },
        },
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT });
    expect(commitCalls).toBe(0);
  });

  it('does not make versioned automatic obligations depend on current actor authority', async () => {
    let commitAuthorization: unknown = 'UNSET';
    const result = await processQueuedCommand({
      command: command(),
      authorityKind: 'VERSIONED_AUTOMATIC',
      commitSimTime: SimTime.fromTicks('10001'),
      recordedAtReal: '2026-09-10T00:00:01.000Z',
      persistence: {
        async readFinalReceipt() {
          return null;
        },
        async recordZeroEffectReceipt(receipt) {
          return receipt;
        },
        async commitAuthorizedCommand(input) {
          commitAuthorization = input.commitAuthorization;
          return committedResult(input.command);
        },
      },
    });
    expect(commitAuthorization).toBeNull();
    expect(result.receipt.outcome).toBe('COMMITTED');
  });
});

describe('V07.2 receipt, outbox and consumer separation', () => {
  it('binds a committed receipt to the Command and one complete transition', () => {
    const value = command();
    const authoritativeTransition = transition(value, {
      eventIds: ['EVENT_1', 'EVENT_2'],
    });
    const receipt = createFinalCommandReceipt({
      command: value,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition: authoritativeTransition,
      simTime: SimTime.fromTicks('10001'),
      recordedAtReal: '2026-09-10T00:00:01.000Z',
    });
    expect(receipt).toMatchObject({
      idempotencyKey: value.idempotencyKey,
      commandFingerprint: value.fingerprint,
      transitionId: value.commandId,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      eventIds: ['EVENT_1', 'EVENT_2'],
    });
  });

  it('rejects receipt evidence for another Command or invalid version boundary', () => {
    const original = command();
    const other = command({
      commandId: 'COMMAND_2',
      idempotencyKey: 'TRANSFER_2',
    });
    expect(() =>
      createFinalCommandReceipt({
        command: original,
        outcome: 'COMMITTED',
        reasonCode: null,
        transition: transition(other),
        simTime: SimTime.fromTicks('10001'),
        recordedAtReal: '2026-09-10T00:00:01.000Z',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.COMMAND_RECEIPT_INVALID,
      }),
    );
    expect(() =>
      transition(original, {
        worldVersionBefore: '1',
        worldVersionAfter: '3',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      }),
    );
  });

  it('rejects a zero-effect receipt that claims Events or WorldVersion', () => {
    expect(() =>
      createFinalCommandReceipt({
        command: command(),
        outcome: 'AUTHORIZATION_REVOKED',
        reasonCode: 'AUTHORIZATION_REVOKED',
        transition: transition(command()),
        simTime: SimTime.fromTicks('10001'),
        recordedAtReal: '2026-09-10T00:00:01.000Z',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.COMMAND_RECEIPT_INVALID,
      }),
    );
  });

  it('redelivers operational messages without changing authoritative references', () => {
    const value = command();
    const pending = createOutboxMessage({
      messageId: 'OUTBOX_1',
      worldId: value.worldId,
      commandId: value.commandId,
      eventId: 'EVENT_1',
      payload: { kind: 'COMMAND_COMMITTED' },
      payloadHash: value.payloadHash,
      availableAtSimTime: SimTime.fromTicks('10001'),
    });
    const failed = recordOutboxDeliveryAttempt({
      message: pending,
      delivered: false,
    });
    const delivered = recordOutboxDeliveryAttempt({
      message: failed,
      delivered: true,
    });
    expect(failed).toMatchObject({ state: 'PENDING', attemptCount: '1' });
    expect(delivered).toMatchObject({
      state: 'DELIVERED',
      attemptCount: '2',
      commandId: value.commandId,
      eventId: eventId('EVENT_1'),
      canonicalPayload: pending.canonicalPayload,
    });
    expect(
      recordOutboxDeliveryAttempt({ message: delivered, delivered: true }),
    ).toBe(delivered);
  });

  it('keeps per-consumer delivery state separate and terminal after delivery', () => {
    const receipt = createEventConsumerReceipt({
      worldId: worldId('WORLD_1'),
      eventId: 'EVENT_1',
      consumerId: 'PROJECTION_1',
    });
    const delivered = recordConsumerDelivery({ receipt, delivered: true });
    expect(delivered).toMatchObject({
      state: 'DELIVERED',
      attemptCount: '1',
    });
    expect(
      recordConsumerDelivery({ receipt: delivered, delivered: false }),
    ).toBe(delivered);
  });
});
