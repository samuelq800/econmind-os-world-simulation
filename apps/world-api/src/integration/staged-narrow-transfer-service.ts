import {
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
  DomainError,
  actorId,
  authSubject,
  authorizeOfficeCapability,
  countryId,
  officeId,
  teamId,
  worldId,
  parseCanonicalCommand,
  parseNarrowTreasuryGcuTransferTerms,
  NARROW_TREASURY_GCU_COMMAND_TYPE,
  NARROW_TREASURY_GCU_PAYLOAD_SCHEMA,
  NARROW_TREASURY_GCU_COMMODITY,
  NARROW_TREASURY_GCU_PAYMENT_SOURCE,
  NARROW_TREASURY_GCU_POLICY_VERSION,
  NARROW_TREASURY_GCU_THRESHOLD_POLICY_VERSION,
  NARROW_TREASURY_GCU_MAX_SETTLEMENT,
  type ActorId,
  type AuthorizedOfficeContext,
  type CanonicalCommand,
  type CommandAcceptance,
  type FinalCommandReceipt,
  type Sha256Hex,
  type AuthenticatedPrincipal,
} from '@econmind/core';
import type { BuyerFinanceApprovalReader } from './authenticated-narrow-transfer-command-handler.js';
import type { ValidatedJwtClaims } from './identity.js';
import type {
  StagedTransferRequest,
  StagedTransferService,
} from './staged-narrow-transfer-handler.js';

interface QueryExecutor {
  query<Row extends object>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }>;
}
interface IntakeInput {
  readonly command: CanonicalCommand;
  readonly scope: {
    readonly actorId: ActorId;
    readonly authorization: AuthorizedOfficeContext;
  };
  readonly observedAtReal: string;
}
type IntakeState =
  | {
      readonly status: 'PENDING_APPROVAL_OR_ENQUEUE' | 'QUEUED' | 'EXECUTING';
      readonly acknowledgement: CommandAcceptance;
    }
  | {
      readonly status: 'FINAL';
      readonly acknowledgement: CommandAcceptance;
      readonly receipt: FinalCommandReceipt;
    }
  | { readonly status: 'NOT_FOUND' }
  | {
      readonly status: 'UNKNOWN';
      readonly worldId: string;
      readonly commandId: string;
      readonly idempotencyKey: string;
      readonly commandFingerprint: string;
      readonly retryable: true;
    };
export interface StagedTransferIntakePort {
  submitPending(input: IntakeInput): Promise<IntakeState>;
  enqueueApproved(input: IntakeInput): Promise<IntakeState>;
  read(input: IntakeInput): Promise<IntakeState>;
}
interface SignInput {
  readonly command: CanonicalCommand;
  readonly signer: {
    readonly actorId: string;
    readonly authSubject: string;
    readonly signedAtReal: string;
  };
}
export interface StagedTransferApprovalPort {
  openSellerOffer(input: SignInput): Promise<void>;
  signBuyerOffice(
    input: SignInput & { readonly office: 'TRADE' | 'FINANCE' },
  ): Promise<void>;
  bindBuyerFinanceApprovalReference(input: {
    readonly command: CanonicalCommand;
    readonly approvalRef: string;
    readonly observedAtReal: string;
  }): Promise<{
    readonly approvalRef: string;
    readonly proposalRef: string;
    readonly commandFingerprint: string;
  }>;
}
export interface StagedTransferServiceInput {
  readonly database: QueryExecutor;
  readonly intake: StagedTransferIntakePort;
  readonly approvals: StagedTransferApprovalPort;
  readonly approvalReader: BuyerFinanceApprovalReader;
  readonly sha256Hex: Sha256Hex;
  /** Trusted identity directory. No browser actor or implicit UUID mapping. */
  readonly resolveActorId: (subject: string) => Promise<string | null>;
  /** Server clock / authoritative World time source; never HTTP fields. */
  readonly clock: {
    nowReal(): string;
    simTime(world: string): Promise<string>;
  };
}

function deny(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
    'Current scoped authority is required',
  );
}
function conflict(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    'Immutable Command identity or intent differs',
  );
}
function realTime(value: Date | string): string {
  const rendered = value instanceof Date ? value.toISOString() : value;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(rendered) ||
    !Number.isFinite(Date.parse(rendered)) ||
    new Date(rendered).toISOString() !== rendered
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID,
      'Invalid server timestamp',
    );
  }
  return rendered;
}
function wireState(state: IntakeState): unknown {
  if (!('acknowledgement' in state)) return state;
  const acknowledgement = {
    ...state.acknowledgement,
    acceptedSimTime: state.acknowledgement.acceptedSimTime.toCanonicalValue(),
  };
  if (state.status !== 'FINAL') return { ...state, acknowledgement };
  return {
    ...state,
    acknowledgement,
    receipt: {
      ...state.receipt,
      simTime: state.receipt.simTime.toCanonicalValue(),
    },
  };
}

interface StoredCommand {
  readonly worldId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandType: string;
  readonly schemaVersion: string;
  readonly canonicalPayload: string;
  readonly payloadHash: string;
  readonly fingerprint: string;
  readonly actorId: string;
  readonly authSubject: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly expectedWorldVersion: string;
  readonly simTime: string;
  readonly correlationId: string;
  readonly submittedAtReal: Date | string;
}

/** API normalization and authorization only; every mutation delegates to the
 * reviewed Worker ports. No Event, Posting, queue SQL or final receipt writes. */
export function createStagedTransferService(
  input: StagedTransferServiceInput,
): StagedTransferService {
  async function load(
    request: StagedTransferRequest,
  ): Promise<CanonicalCommand | null> {
    const result = await input.database.query<StoredCommand>(
      `select world_id as "worldId", command_id as "commandId", idempotency_key as "idempotencyKey",
              command_type as "commandType", schema_version as "schemaVersion",
              canonical_payload as "canonicalPayload", payload_sha256 as "payloadHash", command_fingerprint as fingerprint,
              actor_id as "actorId", auth_subject::text as "authSubject", country_id as "countryId", office_id as "officeId",
              expected_world_version::text as "expectedWorldVersion", sim_time::text as "simTime",
              correlation_id as "correlationId", submitted_at_real as "submittedAtReal"
         from world_v2.command_submission
        where world_id = $1 and (command_id = $2 or idempotency_key = $3)`,
      [request.worldId, request.commandId, request.idempotencyKey],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !row ||
      row.commandId !== request.commandId ||
      row.idempotencyKey !== request.idempotencyKey
    )
      conflict();
    const { fingerprint, payloadHash, canonicalPayload, ...fields } = row;
    const command = parseCanonicalCommand(
      {
        ...fields,
        submittedAtReal: realTime(row.submittedAtReal),
        payload: JSON.parse(canonicalPayload) as unknown,
      },
      input.sha256Hex,
    );
    if (
      command.fingerprint !== fingerprint ||
      command.payloadHash !== payloadHash ||
      command.canonicalPayload !== canonicalPayload
    )
      conflict();
    parseNarrowTreasuryGcuTransferTerms(command);
    return command;
  }

  async function authorize(
    request: StagedTransferRequest,
    claims: ValidatedJwtClaims,
  ) {
    const subject = authSubject(claims.authSubject);
    const capability =
      request.officeId === 'FINANCE' ? 'FINANCE_TREASURY' : 'TRADE_CONTRACTS';
    const resolve = async () => {
      const result = await input.database.query<{
        team_id: string;
        authorization_version: string;
      }>(
        `select team_id, authorization_version from world_v2.current_commit_authorization
          where world_id = $1 and auth_subject = $2::uuid and country_id = $3
            and office_id = $4 and capability = $5 and active`,
        [
          request.worldId,
          subject,
          request.countryId,
          request.officeId,
          capability,
        ],
      );
      if (result.rows.length !== 1) return null;
      const row = result.rows[0]!;
      return {
        authSubject: subject,
        worldId: worldId(request.worldId),
        countryId: countryId(request.countryId),
        teamId: teamId(row.team_id),
        authorizationVersion: row.authorization_version,
        officeAssignments: [officeId(request.officeId)],
        active: true,
        suspended: false,
        isWorldAdmin: false,
        negotiationPartyIds: [],
      };
    };
    const principal: AuthenticatedPrincipal = {
      authSubject: subject,
      facts: { user_id: subject, display_name: null, school_id: null },
      token: {
        subject,
        issuer: claims.issuer,
        audience: claims.audience,
        issuedAt: new Date(claims.issuedAtEpochSeconds * 1000).toISOString(),
        expiresAt: new Date(claims.expiresAtEpochSeconds * 1000).toISOString(),
      },
    };
    const authorization = await authorizeOfficeCapability({
      principal,
      resolver: {
        resolveCurrentIdentity: async () =>
          (await resolve()) ? subject : null,
        resolveCurrentMembership: resolve,
      },
      worldId: worldId(request.worldId),
      requestedCountryId: countryId(request.countryId),
      requestedOfficeId:
        request.officeId as AuthorizedOfficeContext['officeId'],
      capability,
    });
    const actor = await input.resolveActorId(subject);
    if (actor === null) deny();
    return { actorId: actorId(actor), authorization };
  }

  async function construct(
    request: StagedTransferRequest,
    scope: Awaited<ReturnType<typeof authorize>>,
    stored: CanonicalCommand | null,
  ) {
    if (request.officeId !== 'TRADE' || request.intent === undefined) deny();
    const proposed = request.intent;
    const command = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        commandType: NARROW_TREASURY_GCU_COMMAND_TYPE,
        worldId: request.worldId,
        commandId: request.commandId,
        idempotencyKey: request.idempotencyKey,
        countryId: scope.authorization.countryId,
        officeId: 'TRADE',
        actorId: scope.actorId,
        authSubject: scope.authorization.authSubject,
        expectedWorldVersion: proposed.expectedWorldVersion,
        simTime:
          stored?.simTime.toCanonicalValue() ??
          (await input.clock.simTime(request.worldId)),
        submittedAtReal:
          stored?.submittedAtReal ?? realTime(input.clock.nowReal()),
        correlationId:
          stored?.correlationId ?? `CORRELATION_${request.commandId}`,
        payload: {
          schemaVersion: NARROW_TREASURY_GCU_PAYLOAD_SCHEMA,
          commodityId: NARROW_TREASURY_GCU_COMMODITY,
          sellerCountryId: scope.authorization.countryId,
          buyerCountryId: proposed.buyerCountryId,
          quantity: proposed.quantity,
          price: proposed.price,
          assetSource: proposed.assetSource,
          expiresAtReal: realTime(proposed.expiresAtReal),
          paymentSource: NARROW_TREASURY_GCU_PAYMENT_SOURCE,
          policyVersion: NARROW_TREASURY_GCU_POLICY_VERSION,
          threshold: {
            policyVersion: NARROW_TREASURY_GCU_THRESHOLD_POLICY_VERSION,
            maxSettlement: {
              amount: NARROW_TREASURY_GCU_MAX_SETTLEMENT,
              currency: 'GCU',
            },
          },
        },
      },
      input.sha256Hex,
    );
    parseNarrowTreasuryGcuTransferTerms(command);
    if (stored && command.fingerprint !== stored.fingerprint) conflict();
    return command;
  }

  return Object.freeze({
    async execute(request: StagedTransferRequest, claims: ValidatedJwtClaims) {
      const scope = await authorize(request, claims);
      let command = await load(request);
      if (request.action === 'REGISTER') {
        command = await construct(request, scope, command);
        try {
          return wireState(
            await input.intake.submitPending({
              command,
              scope,
              observedAtReal: realTime(input.clock.nowReal()),
            }),
          );
        } catch (error) {
          // A concurrent first registration may choose the initial server clock
          // before us. Reconstruct once from its durable fields, never overwrite.
          if (
            !(error instanceof DomainError) ||
            error.code !== DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT
          )
            throw error;
          const winner = await load(request);
          if (!winner) throw error;
          command = await construct(request, scope, winner);
          return wireState(
            await input.intake.submitPending({
              command,
              scope,
              observedAtReal: realTime(input.clock.nowReal()),
            }),
          );
        }
      }
      if (command === null) return { status: 'NOT_FOUND' };
      const terms = parseNarrowTreasuryGcuTransferTerms(command);
      const seller =
        scope.authorization.countryId === terms.sellerCountryId &&
        request.officeId === 'TRADE';
      const buyer = scope.authorization.countryId === terms.buyerCountryId;
      if (!seller && !buyer) deny();
      if (
        request.commandFingerprint !== undefined &&
        request.commandFingerprint !== command.fingerprint
      )
        conflict();
      if (request.action === 'INSPECT') {
        return {
          status: 'INTENT',
          commandId: command.commandId,
          idempotencyKey: command.idempotencyKey,
          commandFingerprint: command.fingerprint,
          expectedWorldVersion: command.expectedWorldVersion,
          simTime: command.simTime.toCanonicalValue(),
          payload: JSON.parse(command.canonicalPayload) as unknown,
        };
      }
      const observedAtReal = realTime(input.clock.nowReal());
      if (
        request.action === 'READ' ||
        request.action === 'ENQUEUE' ||
        request.action === 'SIGN_SELLER'
      ) {
        if (
          !seller ||
          command.actorId !== scope.actorId ||
          command.authSubject !== scope.authorization.authSubject
        )
          deny();
      } else if (!buyer) deny();
      if (request.action === 'READ')
        return wireState(
          await input.intake.read({ command, scope, observedAtReal }),
        );
      if (request.action === 'ENQUEUE') {
        const approval = await input.approvalReader.readCurrent({
          worldId: command.worldId,
          commandId: command.commandId,
          buyerCountryId: terms.buyerCountryId,
          proposalRef: `BUYER_APPROVAL_${command.commandId}`,
          buyerFinanceApprovalRef: request.approvalRef!,
        });
        if (
          !approval ||
          approval.approvalRef !== request.approvalRef ||
          approval.status !== 'APPROVED' ||
          approval.worldId !== command.worldId ||
          approval.buyerCountryId !== terms.buyerCountryId ||
          approval.officeId !== 'FINANCE' ||
          approval.proposalRef !== `BUYER_APPROVAL_${command.commandId}`
        )
          deny();
        return wireState(
          await input.intake.enqueueApproved({
            command,
            scope,
            observedAtReal,
          }),
        );
      }
      if (request.action === 'BIND_REFERENCE') {
        if (request.officeId !== 'FINANCE') deny();
        const reference =
          await input.approvals.bindBuyerFinanceApprovalReference({
            command,
            approvalRef: `APPROVAL_FINANCE_${command.commandId}`,
            observedAtReal,
          });
        return {
          status: 'REFERENCE_BOUND',
          approvalRef: reference.approvalRef,
          proposalRef: reference.proposalRef,
          commandFingerprint: reference.commandFingerprint,
        };
      }
      const signer = {
        actorId: scope.actorId,
        authSubject: scope.authorization.authSubject,
        signedAtReal: observedAtReal,
      };
      if (request.action === 'SIGN_SELLER')
        await input.approvals.openSellerOffer({ command, signer });
      else {
        const office =
          request.action === 'SIGN_BUYER_TRADE' ? 'TRADE' : 'FINANCE';
        if (request.officeId !== office) deny();
        await input.approvals.signBuyerOffice({ command, office, signer });
      }
      return {
        status: 'SIGNATURE_RECORDED',
        officeId: request.officeId,
        commandFingerprint: command.fingerprint,
      };
    },
  });
}
