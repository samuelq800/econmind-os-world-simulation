import {
  DOMAIN_ERROR_CODES,
  DomainError,
  SimTime,
  createCommandAcceptance,
  isAuthorizedOfficeContext,
  parseCanonicalCommand,
  parseNarrowTreasuryGcuTransferTerms,
  validateCanonicalCommand,
  validateFinalReceiptForCommand,
  type ActorId,
  type AuthorizedOfficeContext,
  type CanonicalCommand,
  type CommandAcceptance,
  type FinalCommandReceipt,
  type Sha256Hex,
} from '@econmind/core';

import { NarrowTransferApprovalStore } from '../persistence/narrow-transfer-approval-store.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';

/** Server-issued binding, never deserialize this from HTTP JSON. */
export interface NarrowTransferIntakeScope {
  readonly actorId: ActorId;
  readonly authorization: AuthorizedOfficeContext;
}

export interface NarrowTransferIntakeInput {
  readonly command: CanonicalCommand;
  readonly scope: NarrowTransferIntakeScope;
  /** Trusted server clock, not client request time. */
  readonly observedAtReal: string;
}

export type NarrowTransferIntakeState =
  | Readonly<{
      status: 'PENDING_APPROVAL_OR_ENQUEUE' | 'QUEUED' | 'EXECUTING';
      acknowledgement: CommandAcceptance;
    }>
  | Readonly<{
      status: 'FINAL';
      acknowledgement: CommandAcceptance;
      receipt: FinalCommandReceipt;
    }>
  | Readonly<{ status: 'NOT_FOUND' }>
  | Readonly<{
      status: 'UNKNOWN';
      worldId: string;
      commandId: string;
      idempotencyKey: string;
      commandFingerprint: string;
      retryable: true;
    }>;

interface SubmissionRow {
  readonly actorId: string;
  readonly authSubject: string;
  readonly commandId: string;
  readonly commandType: string;
  readonly correlationId: string;
  readonly countryId: string;
  readonly expectedWorldVersion: string;
  readonly idempotencyKey: string;
  readonly officeId: string;
  readonly canonicalPayload: string;
  readonly payloadHash: string;
  readonly fingerprint: string;
  readonly schemaVersion: string;
  readonly simTime: string;
  readonly submittedAtReal: Date | string;
  readonly worldId: string;
}

type ReceiptRow = Omit<FinalCommandReceipt, 'simTime' | 'recordedAtReal'> & {
  readonly simTime: string;
  readonly recordedAtReal: Date | string;
};

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID, message);
}

function deny(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED, message);
}

function conflict(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    'Command ID or idempotency key is already bound to different intent',
  );
}

function timestamp(value: Date | string): string {
  const text = value instanceof Date ? value.toISOString() : value;
  if (
    typeof text !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) ||
    !Number.isFinite(Date.parse(text)) ||
    new Date(text).toISOString() !== text
  ) {
    invalid('A canonical UTC millisecond timestamp is required');
  }
  return text;
}

function postgresInteger(value: string | null): void {
  if (
    value === null ||
    !/^(?:0|[1-9]\d*)$/u.test(value) ||
    BigInt(value) > 9_223_372_036_854_775_807n
  ) {
    invalid('A canonical PostgreSQL non-negative bigint is required');
  }
}

/**
 * Server-only staged intake on the existing schema. It never writes Event,
 * Posting, receipt, outbox, lease or WorldVersion. A pending Command has no
 * queue row, so it cannot be claimed while approvals are being collected.
 * This is deliberately NOT the old synchronous final-only HTTP receipt port.
 */
export class PostgresNarrowTransferIntake {
  readonly #database: SqlDatabase;
  readonly #sha256Hex: Sha256Hex;
  readonly #approvals: NarrowTransferApprovalStore;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly sha256Hex: Sha256Hex;
  }) {
    this.#database = input.database;
    this.#sha256Hex = input.sha256Hex;
    // Fixed existing guard: callers cannot inject an always-approved mock.
    this.#approvals = new NarrowTransferApprovalStore(input);
  }

  submitPending(
    input: NarrowTransferIntakeInput,
  ): Promise<NarrowTransferIntakeState> {
    return this.#run(input, 'SUBMIT');
  }

  enqueueApproved(
    input: NarrowTransferIntakeInput,
  ): Promise<NarrowTransferIntakeState> {
    return this.#run(input, 'ENQUEUE');
  }

  read(input: NarrowTransferIntakeInput): Promise<NarrowTransferIntakeState> {
    return this.#run(input, 'READ');
  }

  async #run(
    input: NarrowTransferIntakeInput,
    operation: 'SUBMIT' | 'ENQUEUE' | 'READ',
  ): Promise<NarrowTransferIntakeState> {
    const command = validateCanonicalCommand(input.command, this.#sha256Hex);
    parseNarrowTreasuryGcuTransferTerms(command);
    postgresInteger(command.expectedWorldVersion);
    postgresInteger(command.simTime.toCanonicalValue());
    if (command.idempotencyKey === null)
      invalid('Intake requires an idempotency key');
    const observedAtReal = timestamp(input.observedAtReal);
    const scope = input.scope;
    const auth = scope.authorization;
    if (
      !isAuthorizedOfficeContext(auth) ||
      scope.actorId !== command.actorId ||
      auth.authSubject !== command.authSubject ||
      auth.worldId !== command.worldId ||
      auth.countryId !== command.countryId ||
      auth.officeId !== command.officeId ||
      auth.capability !== 'TRADE_CONTRACTS'
    ) {
      deny('Server-bound actor and current Trade scope must match the Command');
    }

    // Semantic denials are thrown unchanged even when a SQL adapter wraps the
    // callback error. Operational failures never become a made-up final receipt.
    let semanticFailure: DomainError | undefined;
    const inspect = async (transaction: SqlExecutor, write: boolean) => {
      try {
        // Existing Commands must be locked before the head, like Worker commit
        // (submission -> lease -> head). Intake does not need a writer lease.
        let stored = await this.#load(transaction, command, true);
        const head = await transaction.query<{ world_version: string }>(
          `select world_version::text as world_version from world_v2.world_head
            where world_id = $1 for update`,
          [command.worldId],
        );
        if (head.rows.length !== 1) invalid('World head does not exist');
        // A missing row cannot be locked. First registration is serialized by
        // the head and SQL unique constraints; a concurrent registrant may
        // have committed while we waited for that head. Recheck immutably,
        // WITHOUT a submission lock under the head. SUBMIT/read-only recovery
        // may return that stored state but must never enqueue on this path.
        // A first ENQUEUE lookup that found no intent remains NOT_FOUND; a
        // subsequent explicit call can lock the now-existing intent first.
        if (stored === null && (operation === 'SUBMIT' || !write)) {
          stored = await this.#load(transaction, command, false);
        }
        await this.#authorize(transaction, command, auth);
        if (stored !== null) {
          const state = await this.#state(transaction, stored);
          if (
            !write ||
            operation !== 'ENQUEUE' ||
            state.status !== 'PENDING_APPROVAL_OR_ENQUEUE'
          ) {
            return state;
          }
        } else if (!write || operation !== 'SUBMIT') {
          return Object.freeze({ status: 'NOT_FOUND' } as const);
        }
        if (head.rows[0]?.world_version !== command.expectedWorldVersion) {
          throw new DomainError(
            DOMAIN_ERROR_CODES.VERSION_MISMATCH,
            'WorldVersion changed before intake/dispatch',
          );
        }
        const durable = stored ?? command;
        const terms = parseNarrowTreasuryGcuTransferTerms(durable);
        if (
          observedAtReal < durable.submittedAtReal ||
          observedAtReal >= terms.expiresAtReal
        ) {
          deny('Command is outside its offer lifetime');
        }
        if (operation === 'SUBMIT') {
          await this.#insert(transaction, durable);
        } else {
          await this.#approvals.assertCurrent(transaction, {
            command: durable,
            observedAtReal,
          });
          await transaction.query(
            `insert into world_v2.command_queue
               (world_id, command_id, authority_kind, available_at_sim_time)
             values ($1, $2, 'DISCRETIONARY_USER', $3::bigint)`,
            [
              durable.worldId,
              durable.commandId,
              durable.simTime.toCanonicalValue(),
            ],
          );
        }
        return await this.#state(transaction, durable);
      } catch (error) {
        if (error instanceof DomainError) semanticFailure = error;
        throw error;
      }
    };

    try {
      return await this.#database.transaction((transaction) =>
        inspect(transaction, operation !== 'READ'),
      );
    } catch {
      if (semanticFailure !== undefined) throw semanticFailure;
      // Fresh transaction, no blind callback replay; recheck current access even
      // on recovery. A pending row cannot prove enqueue succeeded.
      try {
        const recovered = await this.#database.transaction((transaction) =>
          inspect(transaction, false),
        );
        if (
          recovered.status !== 'NOT_FOUND' &&
          (operation !== 'ENQUEUE' ||
            recovered.status !== 'PENDING_APPROVAL_OR_ENQUEUE')
        )
          return recovered;
      } catch {
        if (semanticFailure !== undefined) throw semanticFailure;
      }
      return Object.freeze({
        status: 'UNKNOWN',
        worldId: command.worldId,
        commandId: command.commandId,
        idempotencyKey: command.idempotencyKey,
        commandFingerprint: command.fingerprint,
        retryable: true,
      });
    }
  }

  async #authorize(
    transaction: SqlExecutor,
    command: CanonicalCommand,
    auth: AuthorizedOfficeContext,
  ): Promise<void> {
    const current = await transaction.query<{
      team_id: string;
      authorization_version: string;
    }>(
      `select team_id, authorization_version from world_v2.current_commit_authorization
        where world_id = $1 and auth_subject = $2::uuid and country_id = $3
          and office_id = $4 and capability = 'TRADE_CONTRACTS' and active
        for update`,
      [
        command.worldId,
        command.authSubject,
        command.countryId,
        command.officeId,
      ],
    );
    if (
      current.rows.length !== 1 ||
      current.rows[0]?.team_id !== auth.teamId ||
      current.rows[0]?.authorization_version !== auth.authorizationVersion
    )
      deny(
        'Current membership, Office, capability or revision no longer matches',
      );
  }

  async #load(
    transaction: SqlExecutor,
    command: CanonicalCommand,
    lockSubmission: boolean,
  ): Promise<CanonicalCommand | null> {
    const result = await transaction.query<SubmissionRow>(
      `select world_id as "worldId", command_id as "commandId", idempotency_key as "idempotencyKey",
              command_type as "commandType", schema_version as "schemaVersion",
              canonical_payload as "canonicalPayload", payload_sha256 as "payloadHash",
              command_fingerprint as fingerprint, auth_subject::text as "authSubject",
              actor_id as "actorId", country_id as "countryId", office_id as "officeId",
              expected_world_version::text as "expectedWorldVersion", sim_time::text as "simTime",
              correlation_id as "correlationId", submitted_at_real as "submittedAtReal"
         from world_v2.command_submission
        where world_id = $1 and (command_id = $2 or idempotency_key = $3)
        order by command_id
        ${lockSubmission ? 'for update' : ''}`,
      [command.worldId, command.commandId, command.idempotencyKey],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    if (result.rows.length !== 1 || row === undefined) conflict();
    const { fingerprint, payloadHash, canonicalPayload, ...fields } = row;
    const stored = parseCanonicalCommand(
      {
        ...fields,
        submittedAtReal: timestamp(row.submittedAtReal),
        payload: JSON.parse(canonicalPayload) as unknown,
      },
      this.#sha256Hex,
    );
    if (
      stored.fingerprint !== fingerprint ||
      stored.payloadHash !== payloadHash ||
      stored.canonicalPayload !== canonicalPayload ||
      stored.fingerprint !== command.fingerprint ||
      stored.commandId !== command.commandId ||
      stored.idempotencyKey !== command.idempotencyKey
    )
      conflict();
    return stored;
  }

  async #insert(
    transaction: SqlExecutor,
    command: CanonicalCommand,
  ): Promise<void> {
    await transaction.query(
      `insert into world_v2.command_submission
         (world_id, command_id, idempotency_key, command_type, schema_version,
          canonical_payload, payload_sha256, command_fingerprint, auth_subject,
          actor_id, country_id, office_id, expected_world_version, sim_time,
          correlation_id, submitted_at_real)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10, $11, $12,
               $13::bigint, $14::bigint, $15, $16::timestamptz)`,
      [
        command.worldId,
        command.commandId,
        command.idempotencyKey,
        command.commandType,
        command.schemaVersion,
        command.canonicalPayload,
        command.payloadHash,
        command.fingerprint,
        command.authSubject,
        command.actorId,
        command.countryId,
        command.officeId,
        command.expectedWorldVersion,
        command.simTime.toCanonicalValue(),
        command.correlationId,
        command.submittedAtReal,
      ],
    );
  }

  async #state(
    transaction: SqlExecutor,
    command: CanonicalCommand,
  ): Promise<NarrowTransferIntakeState> {
    const acknowledgement = createCommandAcceptance(command);
    const result = await transaction.query<ReceiptRow>(
      `select schema_version as "schemaVersion", world_id as "worldId", command_id as "commandId",
              idempotency_key as "idempotencyKey", command_fingerprint as "commandFingerprint",
              outcome, reason_code as "reasonCode", transition_id as "transitionId",
              world_version_before::text as "worldVersionBefore", world_version_after::text as "worldVersionAfter",
              sim_time::text as "simTime", event_ids as "eventIds", recorded_at_real as "recordedAtReal"
         from world_v2.command_receipt where world_id = $1 and command_id = $2`,
      [command.worldId, command.commandId],
    );
    const row = result.rows[0];
    if (row !== undefined) {
      const receipt = validateFinalReceiptForCommand({
        command,
        receipt: Object.freeze({
          ...row,
          simTime: SimTime.fromTicks(row.simTime),
          recordedAtReal: timestamp(row.recordedAtReal),
          eventIds: Object.freeze([...row.eventIds]),
        }),
      });
      if (
        receipt.commandId !== command.commandId ||
        receipt.idempotencyKey !== command.idempotencyKey
      )
        conflict();
      return Object.freeze({ status: 'FINAL', acknowledgement, receipt });
    }
    const queue = await transaction.query<{
      queue_state: string;
      authority_kind: string;
    }>(
      'select queue_state, authority_kind from world_v2.command_queue where world_id = $1 and command_id = $2',
      [command.worldId, command.commandId],
    );
    const queued = queue.rows[0];
    if (queued === undefined)
      return Object.freeze({
        status: 'PENDING_APPROVAL_OR_ENQUEUE',
        acknowledgement,
      });
    if (
      queued.authority_kind !== 'DISCRETIONARY_USER' ||
      !['PENDING', 'CLAIMED'].includes(queued.queue_state)
    ) {
      invalid(
        'Queue state is inconsistent with the absence of a final receipt',
      );
    }
    return Object.freeze({
      status: queued.queue_state === 'PENDING' ? 'QUEUED' : 'EXECUTING',
      acknowledgement,
    });
  }
}
