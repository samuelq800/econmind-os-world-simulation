import {
  DOMAIN_ERROR_CODES,
  DomainError,
  SimTime,
  authSubject,
  authorizeOfficeCapability,
  countryId,
  officeId,
  processQueuedCommand,
  reauthorizeOfficeCapability,
  teamId,
  worldId,
  type AuthenticatedPrincipal,
  type AuthorizationCapability,
  type AuthorizationResolver,
  type AuthorizedOfficeContext,
  type CanonicalCommand,
  type CommandLifecyclePersistencePort,
  type CommitAuthorizationProof,
  type CountryId,
  type MembershipSnapshot,
  type OfficeId,
  type WorldId,
} from '@econmind/core';
import { transferCommand } from '../preparation/v10-transfer-contract.js';

/**
 * Test-only mutable authorization facts for exercising commit-time freshness.
 *
 * This deliberately does not mint a CommitAuthorizationProof. A owns the
 * server-held proof/receipt guards; this fixture makes the four resolver state
 * transitions available to those guard tests without becoming runtime policy.
 */
export const V10_COMMIT_AUTHORIZATION_FIXTURE_VERSION =
  'v10.2-commit-authorization-fixture-v1' as const;

const INITIAL_AUTHORIZATION_VERSION = 'AUTH_V10_SELLER_TRADE_1' as const;
const CHANGED_AUTHORIZATION_VERSION = 'AUTH_V10_SELLER_TRADE_2' as const;
const RESTORED_AUTHORIZATION_VERSION = 'AUTH_V10_SELLER_TRADE_3' as const;

export interface V10CommitAuthorizationFixture {
  readonly fixtureVersion: typeof V10_COMMIT_AUTHORIZATION_FIXTURE_VERSION;
  readonly command: CanonicalCommand;
  readonly principal: AuthenticatedPrincipal;
  readonly resolver: AuthorizationResolver;
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
  readonly capability: AuthorizationCapability;
  readonly initialAuthorizationVersion: typeof INITIAL_AUTHORIZATION_VERSION;
  readonly changedAuthorizationVersion: typeof CHANGED_AUTHORIZATION_VERSION;
  readonly restoredAuthorizationVersion: typeof RESTORED_AUTHORIZATION_VERSION;
  currentMembership(): MembershipSnapshot | null;
  issueAuthorization(): Promise<AuthorizedOfficeContext>;
  issueCommitAuthorizationProof(): Promise<CommitAuthorizationProof>;
  assertIssuedAuthorizationCurrent(
    issued: AuthorizedOfficeContext,
  ): Promise<AuthorizedOfficeContext>;
  suspend(): void;
  revoke(): void;
  revise(): void;
  restore(): void;
}

function mutableMembership(input: {
  readonly principal: AuthenticatedPrincipal;
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
  readonly authorizationVersion: string;
  readonly suspended: boolean;
}): MembershipSnapshot {
  return Object.freeze({
    authorizationVersion: input.authorizationVersion,
    authSubject: input.principal.authSubject,
    worldId: input.worldId,
    teamId: teamId('TEAM_TRANSFER_SELLER_TEST'),
    countryId: input.countryId,
    officeAssignments: Object.freeze([input.officeId]),
    active: true,
    suspended: input.suspended,
    isWorldAdmin: false,
    negotiationPartyIds: Object.freeze(['PARTY_V10_ALPHA']),
  });
}

/**
 * Builds a mutable resolver around the fixed V10 seller Trade command.
 *
 * `assertIssuedAuthorizationCurrent` is a test oracle for the invariant A's
 * CommitAuthorizationProof guard must enforce: a context issued before a
 * changed revision cannot become current merely because the resolver can issue
 * a replacement context. It is intentionally not used by production code.
 */
export function createV10CommitAuthorizationFixture(): Readonly<V10CommitAuthorizationFixture> {
  const command = transferCommand();
  if (command.officeId === null) {
    throw new Error('V10_COMMIT_AUTHORIZATION_FIXTURE_COMMAND_OFFICE_MISSING');
  }
  const requestedWorldId = worldId(command.worldId);
  const requestedCountryId = countryId(command.countryId);
  const requestedOfficeId = officeId(command.officeId);
  const capability: AuthorizationCapability = 'TRADE_CONTRACTS';
  const principal: AuthenticatedPrincipal = Object.freeze({
    authSubject: authSubject(command.authSubject),
    facts: Object.freeze({
      user_id: command.authSubject,
      display_name: 'V10 test seller Trade',
      school_id: null,
    }),
    token: Object.freeze({
      subject: command.authSubject,
      issuer: 'v10-commit-authorization-fixture',
      audience: 'world-v2-test',
      issuedAt: '2026-09-12T00:00:00.000Z',
      expiresAt: '2026-09-13T00:00:00.000Z',
    }),
  });
  const snapshot = (authorizationVersion: string, suspended: boolean) =>
    mutableMembership({
      principal,
      worldId: requestedWorldId,
      countryId: requestedCountryId,
      officeId: requestedOfficeId,
      authorizationVersion,
      suspended,
    });
  let membership: MembershipSnapshot | null = snapshot(
    INITIAL_AUTHORIZATION_VERSION,
    false,
  );
  const resolver: AuthorizationResolver = Object.freeze({
    async resolveCurrentIdentity(candidate: AuthenticatedPrincipal) {
      return candidate.authSubject === principal.authSubject
        ? principal.authSubject
        : null;
    },
    async resolveCurrentMembership(
      candidate: AuthenticatedPrincipal,
      requestedWorld: WorldId,
    ) {
      return candidate.authSubject === principal.authSubject &&
        requestedWorld === requestedWorldId
        ? membership
        : null;
    },
  });
  const issueAuthorization = () =>
    authorizeOfficeCapability({
      principal,
      resolver,
      worldId: requestedWorldId,
      requestedCountryId,
      requestedOfficeId,
      capability,
    });
  const assertIssuedAuthorizationCurrent = async (
    issued: AuthorizedOfficeContext,
  ) => {
    const current = await reauthorizeOfficeCapability(issued);
    if (
      current.authorizationVersion !== issued.authorizationVersion ||
      current.teamId !== issued.teamId
    ) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
        'Issued authorization is stale at the commit boundary',
      );
    }
    return current;
  };
  const issueCommitAuthorizationProof = async () => {
    const intakeAuthorization = await issueAuthorization();
    const capturedSignal = new Error(
      'V10_COMMIT_AUTHORIZATION_FIXTURE_PROOF_CAPTURED',
    );
    let captured: CommitAuthorizationProof | null = null;
    const persistence: CommandLifecyclePersistencePort = {
      async readFinalReceipt() {
        return null;
      },
      async recordZeroEffectReceipt() {
        throw new Error(
          'V10_COMMIT_AUTHORIZATION_FIXTURE_UNEXPECTED_ZERO_EFFECT',
        );
      },
      async commitAuthorizedCommand(input) {
        if (input.commitAuthorization === null) {
          throw new Error(
            'V10_COMMIT_AUTHORIZATION_FIXTURE_COMMIT_PROOF_MISSING',
          );
        }
        captured = input.commitAuthorization;
        throw capturedSignal;
      },
    };
    try {
      await processQueuedCommand({
        command,
        authorityKind: 'DISCRETIONARY_USER',
        commitSimTime: SimTime.fromTicks('10000'),
        recordedAtReal: '2026-09-12T00:00:01.000Z',
        requiredCapability: capability,
        intakeAuthorization,
        persistence,
      });
    } catch (error) {
      if (error !== capturedSignal) throw error;
    }
    if (captured === null) {
      throw new Error('V10_COMMIT_AUTHORIZATION_FIXTURE_PROOF_CAPTURE_FAILED');
    }
    return captured;
  };
  return Object.freeze({
    fixtureVersion: V10_COMMIT_AUTHORIZATION_FIXTURE_VERSION,
    command,
    principal,
    resolver,
    worldId: requestedWorldId,
    countryId: requestedCountryId,
    officeId: requestedOfficeId,
    capability,
    initialAuthorizationVersion: INITIAL_AUTHORIZATION_VERSION,
    changedAuthorizationVersion: CHANGED_AUTHORIZATION_VERSION,
    restoredAuthorizationVersion: RESTORED_AUTHORIZATION_VERSION,
    currentMembership: () => membership,
    issueAuthorization,
    issueCommitAuthorizationProof,
    assertIssuedAuthorizationCurrent,
    suspend: () => {
      membership = snapshot(
        membership?.authorizationVersion ?? INITIAL_AUTHORIZATION_VERSION,
        true,
      );
    },
    revoke: () => {
      membership = null;
    },
    revise: () => {
      membership = snapshot(CHANGED_AUTHORIZATION_VERSION, false);
    },
    restore: () => {
      membership = snapshot(RESTORED_AUTHORIZATION_VERSION, false);
    },
  });
}
