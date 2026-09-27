import {
  DOMAIN_ERROR_CODES,
  DomainError,
  NARROW_TREASURY_GCU_POLICY_VERSION,
  NARROW_TREASURY_GCU_THRESHOLD_POLICY_VERSION,
  parseNarrowTreasuryGcuTransferTerms,
  proposalId,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from '@econmind/core';

import type { SqlDatabase, SqlExecutor } from './sql-database.js';

const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

type RequiredOffice = 'TRADE' | 'FINANCE';
type CurrentCapability = 'TRADE_CONTRACTS' | 'FINANCE_TREASURY';

export interface NarrowTransferApprovalSigner {
  readonly actorId: string;
  readonly authSubject: string;
  readonly signedAtReal: string;
}

export interface NarrowTransferApprovalReference {
  readonly worldId: string;
  readonly approvalRef: string;
  readonly proposalRef: string;
  readonly buyerCountryId: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly officeId: 'FINANCE';
  readonly financeActorId: string;
  readonly financeAuthSubject: string;
  readonly financeAuthorizationVersion: string;
  readonly financeSignedAtReal: string;
  readonly boundAtReal: string;
}

interface ApprovalReferenceRow {
  readonly approval_ref: string;
  readonly proposal_id: string;
  readonly command_id: string;
  readonly command_fingerprint: string;
  readonly buyer_country_id: string;
  readonly finance_actor_id: string;
  readonly finance_auth_subject: string;
  readonly finance_authorization_version: string;
  readonly finance_signed_at_real: string;
  readonly bound_at_real: string;
}

export interface AtomicNarrowTransferApprovalGuard {
  assertCurrent(
    transaction: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      observedAtReal: string;
    }>,
  ): Promise<void>;
}

interface ProposalRow {
  readonly approved_at_real: unknown;
  readonly command_fingerprint: unknown;
  readonly command_id: unknown;
  readonly country_id: unknown;
  readonly policy_version: unknown;
  readonly proposal_id: unknown;
  readonly required_offices: unknown;
  readonly status: unknown;
  readonly threshold_policy_version: unknown;
  readonly world_id: unknown;
}

interface SignatureRow {
  readonly actor_id: unknown;
  readonly auth_subject: unknown;
  readonly authorization_version: unknown;
  readonly office_id: unknown;
  readonly proposal_id: unknown;
}

interface CurrentAuthorizationRow {
  readonly authorization_version: unknown;
}

interface DurableCommandRow {
  readonly canonical_payload: unknown;
  readonly command_fingerprint: unknown;
  readonly payload_sha256: unknown;
}

function deny(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED, message);
}

function conflict(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT, message);
}

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID, message);
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function canonicalTimestamp(value: string, label: string): string {
  if (!RFC3339_MILLISECONDS.test(value)) {
    invalid(`${label} must be canonical RFC3339 UTC milliseconds`);
  }
  return value;
}

function requiredOffices(value: unknown): readonly RequiredOffice[] {
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            invalid('Durable required Office set must be valid JSON');
          }
        })()
      : value;
  if (
    !Array.isArray(parsed) ||
    parsed.some((office) => office !== 'TRADE' && office !== 'FINANCE')
  ) {
    invalid('Durable required Office set is malformed');
  }
  return Object.freeze([...parsed] as RequiredOffice[]);
}

function sameOffices(
  actual: readonly RequiredOffice[],
  expected: readonly RequiredOffice[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((office, index) => office === expected[index])
  );
}

function sellerProposalId(command: CanonicalCommand): string {
  return proposalId(`SELLER_APPROVAL_${command.commandId}`);
}

function buyerProposalId(command: CanonicalCommand): string {
  return proposalId(`BUYER_APPROVAL_${command.commandId}`);
}

function capabilityFor(office: RequiredOffice): CurrentCapability {
  return office === 'FINANCE' ? 'FINANCE_TREASURY' : 'TRADE_CONTRACTS';
}

interface ExpectedProposal {
  readonly countryId: string;
  readonly proposalId: string;
  readonly requiredOffices: readonly RequiredOffice[];
}

function expectedProposals(command: CanonicalCommand): Readonly<{
  buyer: ExpectedProposal;
  seller: ExpectedProposal;
}> {
  const terms = parseNarrowTreasuryGcuTransferTerms(command);
  return Object.freeze({
    seller: Object.freeze({
      countryId: terms.sellerCountryId,
      proposalId: sellerProposalId(command),
      requiredOffices: Object.freeze(['TRADE'] as const),
    }),
    buyer: Object.freeze({
      countryId: terms.buyerCountryId,
      proposalId: buyerProposalId(command),
      requiredOffices: Object.freeze(['TRADE', 'FINANCE'] as const),
    }),
  });
}

function assertSignatureTime(input: {
  readonly command: CanonicalCommand;
  readonly expiresAtReal: string;
  readonly signedAtReal: string;
}): void {
  const signedAt = canonicalTimestamp(input.signedAtReal, 'Signature time');
  if (
    signedAt <
      canonicalTimestamp(input.command.submittedAtReal, 'submittedAtReal') ||
    signedAt >= canonicalTimestamp(input.expiresAtReal, 'expiresAtReal')
  ) {
    deny('Approval signature is outside the canonical offer lifetime');
  }
}

function assertProposalScope(
  row: ProposalRow,
  input: Readonly<{
    command: CanonicalCommand;
    countryId: string;
    proposalId: string;
    requiredOffices: readonly RequiredOffice[];
  }>,
): void {
  if (
    text(row.world_id, 'proposal World ID') !== input.command.worldId ||
    text(row.proposal_id, 'proposal ID') !== input.proposalId ||
    text(row.command_id, 'proposal Command ID') !== input.command.commandId ||
    text(row.country_id, 'proposal country ID') !== input.countryId ||
    text(row.command_fingerprint, 'proposal Command fingerprint') !==
      input.command.fingerprint ||
    text(row.policy_version, 'proposal policy version') !==
      NARROW_TREASURY_GCU_POLICY_VERSION ||
    text(row.threshold_policy_version, 'proposal threshold policy version') !==
      NARROW_TREASURY_GCU_THRESHOLD_POLICY_VERSION ||
    !sameOffices(requiredOffices(row.required_offices), input.requiredOffices)
  ) {
    conflict('Durable proposal identity is bound to different transfer intent');
  }
}

async function readCurrentAuthorization(
  transaction: SqlExecutor,
  input: Readonly<{
    authSubject: string;
    capability: CurrentCapability;
    command: CanonicalCommand;
    countryId: string;
    office: RequiredOffice;
  }>,
): Promise<string> {
  const result = await transaction.query<CurrentAuthorizationRow>(
    `select authorization_version
       from world_v2.current_commit_authorization
      where world_id = $1
        and auth_subject = $2::uuid
        and country_id = $3
        and office_id = $4
        and capability = $5
        and active
      for update`,
    [
      input.command.worldId,
      input.authSubject,
      input.countryId,
      input.office,
      input.capability,
    ],
  );
  const row = result.rows[0];
  if (row === undefined || result.rows.length !== 1) {
    deny('No current server-held authorization exists for required Office');
  }
  return text(row.authorization_version, 'Current authorization version');
}

/**
 * An internally canonical object is not enough to open or sign an offer. The
 * immutable Command ledger must already contain the same intent, locked before
 * any proposal or signature is created.
 */
async function lockAndAssertDurableCommand(
  transaction: SqlExecutor,
  command: CanonicalCommand,
): Promise<void> {
  const result = await transaction.query<DurableCommandRow>(
    `select canonical_payload, payload_sha256, command_fingerprint
       from world_v2.command_submission
      where world_id = $1 and command_id = $2
      for update`,
    [command.worldId, command.commandId],
  );
  const row = result.rows[0];
  if (row === undefined || result.rows.length !== 1) {
    deny('Approval requires an existing durable canonical Command');
  }
  if (
    text(row.canonical_payload, 'Durable Command payload') !==
      command.canonicalPayload ||
    text(row.payload_sha256, 'Durable Command payload hash') !==
      command.payloadHash ||
    text(row.command_fingerprint, 'Durable Command fingerprint') !==
      command.fingerprint
  ) {
    conflict('Durable Command identity is bound to different canonical intent');
  }
}

async function readProposal(
  transaction: SqlExecutor,
  input: Readonly<{ command: CanonicalCommand; proposalId: string }>,
): Promise<ProposalRow | null> {
  const result = await transaction.query<ProposalRow>(
    `select world_id, proposal_id, command_id, country_id, command_fingerprint,
            policy_version, threshold_policy_version, required_offices, status,
            approved_at_real
       from world_v2.narrow_transfer_proposal
      where world_id = $1 and proposal_id = $2
      for update`,
    [input.command.worldId, input.proposalId],
  );
  return result.rows[0] ?? null;
}

async function readSignatures(
  transaction: SqlExecutor,
  input: Readonly<{ command: CanonicalCommand; proposalId: string }>,
): Promise<readonly SignatureRow[]> {
  const result = await transaction.query<SignatureRow>(
    `select proposal_id, office_id, actor_id, auth_subject::text as auth_subject,
            authorization_version
       from world_v2.narrow_transfer_approval_signature
      where world_id = $1 and proposal_id = $2
      order by office_id
      for update`,
    [input.command.worldId, input.proposalId],
  );
  return result.rows;
}

function assertSignatureMatches(
  row: SignatureRow,
  input: Readonly<{
    authorizationVersion: string;
    office: RequiredOffice;
    proposalId: string;
    signer: NarrowTransferApprovalSigner;
  }>,
): void {
  if (
    text(row.proposal_id, 'signature proposal ID') !== input.proposalId ||
    text(row.office_id, 'signature Office ID') !== input.office ||
    text(row.actor_id, 'signature actor ID') !== input.signer.actorId ||
    text(row.auth_subject, 'signature auth subject') !==
      input.signer.authSubject ||
    text(row.authorization_version, 'signature authorization version') !==
      input.authorizationVersion
  ) {
    conflict(
      'Durable Office signature is bound to a different signer or revision',
    );
  }
}

/**
 * Server-only durable proposal/signature persistence for the exact V10.2
 * fixture. This class deliberately owns no HTTP or browser-facing interface.
 */
export class NarrowTransferApprovalStore implements AtomicNarrowTransferApprovalGuard {
  readonly #database: SqlDatabase;
  readonly #sha256Hex: Sha256Hex;

  constructor(
    input: Readonly<{ database: SqlDatabase; sha256Hex: Sha256Hex }>,
  ) {
    this.#database = input.database;
    this.#sha256Hex = input.sha256Hex;
  }

  /**
   * Bind, never manufacture, an already durable Finance signature. Trusted
   * server callers must first persist the Command and obtain all approvals.
   * This is not initial Command intake or a substitute for assertCurrent at
   * commit. Even an exact retry rechecks current authority and expiry.
   */
  async bindBuyerFinanceApprovalReference(
    input: Readonly<{
      command: CanonicalCommand;
      approvalRef: string;
      observedAtReal: string;
    }>,
  ): Promise<NarrowTransferApprovalReference> {
    const command = validateCanonicalCommand(input.command, this.#sha256Hex);
    const approvalRef = proposalId(input.approvalRef);
    const observedAtReal = canonicalTimestamp(
      input.observedAtReal,
      'Reference binding observation time',
    );
    const buyer = expectedProposals(command).buyer;
    return this.#database.transaction(async (transaction) => {
      await this.assertCurrent(transaction, { command, observedAtReal });
      // Read timestamps as UTC text so native pg and PGlite return the same
      // immutable representation. Never derive signer identity from the caller.
      await transaction.query(
        `insert into world_v2.narrow_transfer_approval_reference
           (world_id, approval_ref, proposal_id, buyer_country_id, command_id,
            command_fingerprint, finance_actor_id, finance_auth_subject,
            finance_authorization_version, finance_signed_at_real, bound_at_real)
         select s.world_id, $3, s.proposal_id, s.country_id, $4, $5,
                s.actor_id, s.auth_subject, s.authorization_version,
                s.signed_at_real, $6::timestamptz
           from world_v2.narrow_transfer_approval_signature s
          where s.world_id = $1 and s.proposal_id = $2 and s.office_id = 'FINANCE'
         on conflict do nothing`,
        [
          command.worldId,
          buyer.proposalId,
          approvalRef,
          command.commandId,
          command.fingerprint,
          observedAtReal,
        ],
      );
      const result = await transaction.query<ApprovalReferenceRow>(
        `select approval_ref, proposal_id, buyer_country_id, command_id,
                command_fingerprint, finance_actor_id,
                finance_auth_subject::text as finance_auth_subject,
                finance_authorization_version,
                to_char(finance_signed_at_real at time zone 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as finance_signed_at_real,
                to_char(bound_at_real at time zone 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as bound_at_real
           from world_v2.narrow_transfer_approval_reference
          where world_id = $1 and (approval_ref = $2 or proposal_id = $3)
          for update`,
        [command.worldId, approvalRef, buyer.proposalId],
      );
      const row = result.rows[0];
      if (
        result.rows.length !== 1 ||
        row === undefined ||
        row.approval_ref !== approvalRef ||
        row.proposal_id !== buyer.proposalId ||
        row.buyer_country_id !== buyer.countryId ||
        row.command_id !== command.commandId ||
        row.command_fingerprint !== command.fingerprint
      ) {
        conflict(
          'Approval reference or buyer proposal already has another immutable binding',
        );
      }
      return Object.freeze({
        worldId: command.worldId,
        approvalRef: row.approval_ref,
        proposalRef: row.proposal_id,
        buyerCountryId: row.buyer_country_id,
        commandId: row.command_id,
        commandFingerprint: row.command_fingerprint,
        officeId: 'FINANCE',
        financeActorId: row.finance_actor_id,
        financeAuthSubject: row.finance_auth_subject,
        financeAuthorizationVersion: row.finance_authorization_version,
        financeSignedAtReal: row.finance_signed_at_real,
        boundAtReal: row.bound_at_real,
      });
    });
  }

  async openSellerOffer(
    input: Readonly<{
      command: CanonicalCommand;
      signer: NarrowTransferApprovalSigner;
    }>,
  ): Promise<void> {
    const command = validateCanonicalCommand(input.command, this.#sha256Hex);
    const terms = parseNarrowTreasuryGcuTransferTerms(command);
    if (
      input.signer.actorId !== command.actorId ||
      input.signer.authSubject !== command.authSubject
    ) {
      deny('Seller offer must be opened by the canonical Command actor');
    }
    assertSignatureTime({
      command,
      expiresAtReal: terms.expiresAtReal,
      signedAtReal: input.signer.signedAtReal,
    });
    await this.#database.transaction(async (transaction) => {
      await lockAndAssertDurableCommand(transaction, command);
      const expected = expectedProposals(command);
      const authorizationVersion = await readCurrentAuthorization(transaction, {
        authSubject: input.signer.authSubject,
        capability: 'TRADE_CONTRACTS',
        command,
        countryId: terms.sellerCountryId,
        office: 'TRADE',
      });
      const existingSeller = await readProposal(transaction, {
        command,
        proposalId: expected.seller.proposalId,
      });
      const existingBuyer = await readProposal(transaction, {
        command,
        proposalId: expected.buyer.proposalId,
      });
      if ((existingSeller === null) !== (existingBuyer === null)) {
        conflict('Durable proposal pair is incomplete');
      }
      if (existingSeller === null || existingBuyer === null) {
        for (const proposal of [expected.seller, expected.buyer]) {
          await transaction.query(
            `insert into world_v2.narrow_transfer_proposal
               (world_id, proposal_id, command_id, country_id, command_fingerprint,
                policy_version, threshold_policy_version, required_offices, status,
                opened_at_real, approved_at_real)
             values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'PENDING',
                     $9::timestamptz, null)`,
            [
              command.worldId,
              proposal.proposalId,
              command.commandId,
              proposal.countryId,
              command.fingerprint,
              NARROW_TREASURY_GCU_POLICY_VERSION,
              NARROW_TREASURY_GCU_THRESHOLD_POLICY_VERSION,
              JSON.stringify(proposal.requiredOffices),
              input.signer.signedAtReal,
            ],
          );
        }
      } else {
        assertProposalScope(existingSeller, { command, ...expected.seller });
        assertProposalScope(existingBuyer, { command, ...expected.buyer });
      }
      const sellerSignatures = await readSignatures(transaction, {
        command,
        proposalId: expected.seller.proposalId,
      });
      const existingSignature = sellerSignatures[0];
      if (existingSignature === undefined) {
        await transaction.query(
          `insert into world_v2.narrow_transfer_approval_signature
             (world_id, proposal_id, country_id, office_id, actor_id, auth_subject,
              authorization_version, signed_at_real)
           values ($1, $2, $3, 'TRADE', $4, $5::uuid, $6, $7::timestamptz)`,
          [
            command.worldId,
            expected.seller.proposalId,
            terms.sellerCountryId,
            input.signer.actorId,
            input.signer.authSubject,
            authorizationVersion,
            input.signer.signedAtReal,
          ],
        );
        await transaction.query(
          `update world_v2.narrow_transfer_proposal
              set status = 'APPROVED', approved_at_real = $3::timestamptz
            where world_id = $1 and proposal_id = $2`,
          [
            command.worldId,
            expected.seller.proposalId,
            input.signer.signedAtReal,
          ],
        );
      } else {
        assertSignatureMatches(existingSignature, {
          authorizationVersion,
          office: 'TRADE',
          proposalId: expected.seller.proposalId,
          signer: input.signer,
        });
      }
    });
  }

  async signBuyerOffice(
    input: Readonly<{
      command: CanonicalCommand;
      office: RequiredOffice;
      signer: NarrowTransferApprovalSigner;
    }>,
  ): Promise<void> {
    if (input.office !== 'TRADE' && input.office !== 'FINANCE') {
      invalid('Buyer approval Office is outside the exact V10.2 fixture');
    }
    const command = validateCanonicalCommand(input.command, this.#sha256Hex);
    const terms = parseNarrowTreasuryGcuTransferTerms(command);
    assertSignatureTime({
      command,
      expiresAtReal: terms.expiresAtReal,
      signedAtReal: input.signer.signedAtReal,
    });
    await this.#database.transaction(async (transaction) => {
      await lockAndAssertDurableCommand(transaction, command);
      const expected = expectedProposals(command);
      const seller = await readProposal(transaction, {
        command,
        proposalId: expected.seller.proposalId,
      });
      const buyer = await readProposal(transaction, {
        command,
        proposalId: expected.buyer.proposalId,
      });
      if (seller === null || buyer === null) {
        deny('Seller offer must exist before Buyer Office approval');
      }
      assertProposalScope(seller, { command, ...expected.seller });
      assertProposalScope(buyer, { command, ...expected.buyer });
      if (text(seller.status, 'seller proposal status') !== 'APPROVED') {
        deny('Seller Trade approval is not complete');
      }
      const authorizationVersion = await readCurrentAuthorization(transaction, {
        authSubject: input.signer.authSubject,
        capability: capabilityFor(input.office),
        command,
        countryId: terms.buyerCountryId,
        office: input.office,
      });
      const signatures = await readSignatures(transaction, {
        command,
        proposalId: expected.buyer.proposalId,
      });
      const sameOffice = signatures.find(
        (signature) => signature.office_id === input.office,
      );
      if (sameOffice !== undefined) {
        assertSignatureMatches(sameOffice, {
          authorizationVersion,
          office: input.office,
          proposalId: expected.buyer.proposalId,
          signer: input.signer,
        });
        return;
      }
      if (text(buyer.status, 'buyer proposal status') !== 'PENDING') {
        deny(
          'Buyer proposal is already finalized without this Office signature',
        );
      }
      await transaction.query(
        `insert into world_v2.narrow_transfer_approval_signature
           (world_id, proposal_id, country_id, office_id, actor_id, auth_subject,
            authorization_version, signed_at_real)
         values ($1, $2, $3, $4, $5, $6::uuid, $7, $8::timestamptz)`,
        [
          command.worldId,
          expected.buyer.proposalId,
          terms.buyerCountryId,
          input.office,
          input.signer.actorId,
          input.signer.authSubject,
          authorizationVersion,
          input.signer.signedAtReal,
        ],
      );
      const allOffices = new Set([
        ...signatures.map((signature) => signature.office_id),
        input.office,
      ]);
      if (
        expected.buyer.requiredOffices.every((office) =>
          allOffices.has(office),
        ) &&
        allOffices.size === expected.buyer.requiredOffices.length
      ) {
        await transaction.query(
          `update world_v2.narrow_transfer_proposal
              set status = 'APPROVED', approved_at_real = $3::timestamptz
            where world_id = $1 and proposal_id = $2`,
          [
            command.worldId,
            expected.buyer.proposalId,
            input.signer.signedAtReal,
          ],
        );
      }
    });
  }

  async assertCurrent(
    transaction: SqlExecutor,
    input: Readonly<{ command: CanonicalCommand; observedAtReal: string }>,
  ): Promise<void> {
    const command = validateCanonicalCommand(input.command, this.#sha256Hex);
    const terms = parseNarrowTreasuryGcuTransferTerms(command);
    const observedAt = canonicalTimestamp(
      input.observedAtReal,
      'Commit observation time',
    );
    if (
      observedAt >= canonicalTimestamp(terms.expiresAtReal, 'expiresAtReal')
    ) {
      deny('Narrow transfer expired before authoritative commit');
    }
    await lockAndAssertDurableCommand(transaction, command);
    const expected = expectedProposals(command);
    for (const proposal of [expected.seller, expected.buyer]) {
      const row = await readProposal(transaction, {
        command,
        proposalId: proposal.proposalId,
      });
      if (row === null) deny('Durable required approval proposal is absent');
      assertProposalScope(row, { command, ...proposal });
      if (text(row.status, 'proposal status') !== 'APPROVED') {
        deny('Durable required proposal is not approved');
      }
      const signatures = await readSignatures(transaction, {
        command,
        proposalId: proposal.proposalId,
      });
      if (signatures.length !== proposal.requiredOffices.length) {
        deny('Durable proposal has missing or duplicate Office signatures');
      }
      for (const office of proposal.requiredOffices) {
        const signature = signatures.find(
          (candidate) => candidate.office_id === office,
        );
        if (signature === undefined) deny('Durable Office signature is absent');
        const authSubject = text(
          signature.auth_subject,
          'signature auth subject',
        );
        const authorizationVersion = await readCurrentAuthorization(
          transaction,
          {
            authSubject,
            capability: capabilityFor(office),
            command,
            countryId: proposal.countryId,
            office,
          },
        );
        if (
          text(
            signature.authorization_version,
            'signature authorization version',
          ) !== authorizationVersion
        ) {
          deny('Durable Office signature authorization revision is stale');
        }
      }
    }
  }
}

export function createNarrowTransferApprovalStore(
  input: Readonly<{
    database: SqlDatabase;
    sha256Hex: Sha256Hex;
  }>,
): NarrowTransferApprovalStore {
  return new NarrowTransferApprovalStore(input);
}
