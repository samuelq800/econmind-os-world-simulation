import {
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_CAPABILITY,
  CENTRAL_BANK_OMO_COMMAND,
  CENTRAL_BANK_OMO_CAPABILITY,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_CAPABILITY,
  DOMAIN_ERROR_CODES,
  DomainError,
  authorizeOfficeCapability,
  prepareCaptainPoliticalCapitalEvent,
  validateCentralBankOmoSource,
  prepareSocialEmploymentServiceOperation,
  canonicalHashInput,
  canonicalSha256,
  officeId,
  teamId,
  parseCaptainPoliticalCapitalAllocation,
  parseCentralBankOmoIntent,
  parseSocialEmploymentServiceCommand,
  type AuthenticatedPrincipal,
  type AuthorizedOfficeContext,
  type CanonicalCommand,
  type Sha256Hex,
} from '@econmind/core';
import {
  createCaptainPoliticalCapitalCandidateFactory,
  createCaptainPoliticalCapitalRuntimeSource,
  CaptainPoliticalCapitalSourceMissing,
  type CaptainPoliticalCapitalRuntimeReader,
} from '../persistence/captain-political-capital-candidate-source.js';
import {
  createCentralBankOmoCandidateFactory,
  loadCentralBankOmoCandidateSource,
  type CentralBankOmoReader,
} from '../persistence/central-bank-omo-candidate-source.js';
import {
  SqlSocialJobMatchCandidateSource,
  SocialOperatingStateMissingError,
  createSocialJobMatchCandidateFactory,
  type SqlSocialJobMatchCandidateSourceInput,
} from '../persistence/social-job-match-candidate-source.js';
import type { AtomicTransitionCandidateFactory } from '../persistence/atomic-transition-repository.js';
import type { SqlDatabase } from '../persistence/sql-database.js';

/** Server constructor dependencies only. No request snapshot, prebuilt draft,
 * caller candidateFactory, readiness registry or automatic publisher port. */
export interface ManualOfficeRuntimeReaders {
  readonly captain?: CaptainPoliticalCapitalRuntimeReader | null;
  readonly centralBank?: CentralBankOmoReader | null;
  readonly social?: Pick<
    SqlSocialJobMatchCandidateSourceInput,
    'mode' | 'openingAdoption' | 'snapshotReader'
  > | null;
}

export function manualOfficeCapability(command: CanonicalCommand) {
  switch (command.commandType) {
    case CAPTAIN_POLITICAL_CAPITAL_COMMAND:
      return CAPTAIN_POLITICAL_CAPITAL_CAPABILITY;
    case CENTRAL_BANK_OMO_COMMAND:
      return CENTRAL_BANK_OMO_CAPABILITY;
    case SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND:
      return SOCIAL_EMPLOYMENT_SERVICE_CAPABILITY;
    default:
      return null;
  }
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

/** Durable subject is the prior authenticated intake's audit anchor, not a new
 * login/grant. Every membership and reauthorization resolution uses actual SQL.
 * No row, ambiguous row or incoherent current membership means denial. */
export async function authorizeManualOfficeCommand(input: {
  database: SqlDatabase;
  command: CanonicalCommand;
}): Promise<AuthorizedOfficeContext> {
  const command = input.command,
    capability = manualOfficeCapability(command);
  if (capability === null || command.officeId === null)
    invalid('Unsupported manual family');
  const resolve = async () => {
    const r = await input.database.query<{
      team_id: string;
      authorization_version: string;
    }>(
      `select a.team_id, a.authorization_version from world_v2.current_commit_authorization a
       where a.world_id=$1 and a.auth_subject=$2::uuid and a.country_id=$3
         and a.office_id=$4 and a.capability=$5 and a.active
         and not exists(select 1 from world_v2.current_commit_authorization other
           where other.world_id=a.world_id and other.auth_subject=a.auth_subject and other.active
             and (other.country_id is distinct from a.country_id or other.team_id is distinct from a.team_id
               or other.authorization_version is distinct from a.authorization_version))`,
      [
        command.worldId,
        command.authSubject,
        command.countryId,
        command.officeId,
        capability,
      ],
    );
    if (r.rows.length !== 1 || !r.rows[0]) return null;
    return {
      authSubject: command.authSubject,
      worldId: command.worldId,
      countryId: command.countryId,
      teamId: teamId(r.rows[0].team_id),
      authorizationVersion: r.rows[0].authorization_version,
      officeAssignments: [officeId(command.officeId!)],
      active: true,
      suspended: false,
      isWorldAdmin: false,
      negotiationPartyIds: [],
    };
  };
  const principal: AuthenticatedPrincipal = {
    authSubject: command.authSubject,
    facts: {
      user_id: command.authSubject,
      display_name: null,
      school_id: null,
    },
    token: {
      subject: command.authSubject,
      issuer: 'urn:world-v2:durable-command-audit',
      audience: 'world-worker',
      issuedAt: command.submittedAtReal,
      expiresAt: command.submittedAtReal,
    },
  };
  return authorizeOfficeCapability({
    principal,
    resolver: {
      resolveCurrentIdentity: async () =>
        (await resolve()) ? command.authSubject : null,
      resolveCurrentMembership: resolve,
    },
    worldId: command.worldId,
    requestedCountryId: command.countryId,
    requestedOfficeId: command.officeId,
    capability,
  });
}

/** Fixed real family factories, no economic callback selected by HTTP. An absent
 * trusted reader refuses before a queue claim; an automatic Social match is not
 * included. Factories retain their own Core proof/source/lease validation. */
export function createManualOfficeCommandComposition(input: {
  readonly command: CanonicalCommand;
  readonly database: SqlDatabase;
  readonly workerId: string;
  readonly sha256Hex: Sha256Hex;
  readonly readers: ManualOfficeRuntimeReaders;
}): {
  readonly factory: AtomicTransitionCandidateFactory;
  assertSourceBeforeClaim(observedAtReal: string): Promise<void>;
} | null {
  const command = input.command,
    digest = input.sha256Hex;
  const cap = manualOfficeCapability(command);
  if (cap === null) invalid('Manual factory requires a supported family');
  switch (command.commandType) {
    case CAPTAIN_POLITICAL_CAPITAL_COMMAND: {
      parseCaptainPoliticalCapitalAllocation(command, digest);
      if (!input.readers.captain) return null;
      const source = createCaptainPoliticalCapitalRuntimeSource({
        reader: input.readers.captain,
        sha256Hex: digest,
      });
      const factory = createCaptainPoliticalCapitalCandidateFactory({
        sha256Hex: digest,
        source,
      });
      return {
        factory,
        async assertSourceBeforeClaim(observedAtReal) {
          const read = await source.load({ command, observedAtReal });
          if (read.kind === 'MISSING')
            throw new CaptainPoliticalCapitalSourceMissing(read.missing);
          // Pure data/kernel check only. A commit proof is issued exclusively
          // by the existing authoritative execution after the durable claim.
          prepareCaptainPoliticalCapitalEvent({
            command,
            source: read.snapshot,
            eventId: `EVENT_${command.commandId}_CAPITAL`,
            recordedAtReal: observedAtReal,
            sha256Hex: digest,
          });
        },
      };
    }
    case CENTRAL_BANK_OMO_COMMAND: {
      const intent = parseCentralBankOmoIntent(command, digest);
      const reader = input.readers.centralBank;
      if (!reader) return null;
      const factory: AtomicTransitionCandidateFactory = {
        async prepare(candidate) {
          const preparation = await loadCentralBankOmoCandidateSource({
            ...candidate,
            reader,
            sha256Hex: digest,
          });
          return createCentralBankOmoCandidateFactory({
            preparation,
            sha256Hex: digest,
          }).prepare(candidate);
        },
      };
      return {
        factory,
        async assertSourceBeforeClaim() {
          const read = await reader.read({
            worldId: command.worldId,
            commandId: command.commandId,
            commandFingerprint: command.fingerprint,
            countryId: command.countryId,
            expectedWorldVersion: command.expectedWorldVersion!,
            settlementSimTime: intent.settlementSimTime,
            securityRef: intent.securityRef,
            batchRef: intent.batchRef,
          });
          validateCentralBankOmoSource({
            command,
            source: read.source,
            sha256Hex: digest,
          });
          if (
            read.commitAssertion.worldId !== command.worldId ||
            read.commitAssertion.expectedWorldVersion !==
              command.expectedWorldVersion ||
            read.commitAssertion.holderId !== input.workerId
          )
            invalid('Central Bank source must bind this World/head/Worker');
        },
      };
    }
    case SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND: {
      if (parseSocialEmploymentServiceCommand(command, digest).kind !== 'PLAN')
        invalid('Only manual Social PLAN');
      const config = input.readers.social;
      if (!config?.snapshotReader) return null;
      const reader = config.snapshotReader;
      const source = new SqlSocialJobMatchCandidateSource({
        ...config,
        database: input.database,
        workerId: input.workerId,
        sha256Hex: digest,
        automaticAuthority: null,
      });
      const factory = createSocialJobMatchCandidateFactory({
        source,
        sha256Hex: digest,
      });
      return {
        factory,
        async assertSourceBeforeClaim(observedAtReal) {
          // Social's real source requires a CLAIMED row. Peek through its same
          // trusted snapshot reader first so MISSING operating state never leaves
          // a new claim. The actual source then re-reads/validates after the claim.
          await input.database.transaction(async (transaction) => {
            const head = await transaction.query<{
              world_version: string;
              event_sequence: string;
            }>(
              'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
              [command.worldId],
            );
            if (head.rows.length !== 1 || !head.rows[0])
              invalid('Current Social head required');
            const h = head.rows[0];
            if (h.world_version !== command.expectedWorldVersion)
              throw new DomainError(
                DOMAIN_ERROR_CODES.VERSION_MISMATCH,
                'Social head changed before source preflight',
              );
            const read = await reader.readFrom({
              transaction,
              command,
              headWorldVersion: h.world_version,
              headEventSequence: h.event_sequence,
              observedAtReal,
            });
            if (read.status === 'MISSING_OPERATING_STATE')
              throw new SocialOperatingStateMissingError(
                config.openingAdoption,
              );
            if (
              read.status !== 'REPLAYED' ||
              read.worldId !== command.worldId ||
              read.headWorldVersion !== h.world_version ||
              read.headEventSequence !== h.event_sequence ||
              !(
                read.provenance === 'ADMITTED_OPENING_AND_EVENTS' ||
                (config.mode === 'TEST_ONLY_LOCAL' &&
                  read.provenance === 'TEST_ONLY')
              )
            )
              invalid(
                'Social source preflight requires the actual same-head lineage reader',
              );
            if (
              canonicalSha256(canonicalHashInput(read.state), digest) !==
                read.stateHash ||
              canonicalSha256(canonicalHashInput(read.readFacts), digest) !==
                read.readFactsHash
            )
              invalid('Social preflight state/read-facts hash mismatch');
            prepareSocialEmploymentServiceOperation({
              command,
              state: read.state,
              readFacts: read.readFacts,
              sha256Hex: digest,
            });
          });
        },
      };
    }
    default:
      invalid('Unsupported manual composition');
  }
}

export function isManualOfficeSourceMissing(error: unknown): boolean {
  return (
    error instanceof CaptainPoliticalCapitalSourceMissing ||
    error instanceof SocialOperatingStateMissingError
  );
}
