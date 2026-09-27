import type { Pool } from 'pg';

import type { BuyerFinanceApprovalReader } from './authenticated-narrow-transfer-command-handler.js';

/**
 * This query is run from a server-held PostgreSQL role only.  The immutable
 * 0017 row narrows the lookup, but it is never treated as a credential: the
 * query also verifies the durable Command fingerprint, the original Finance
 * signature, the current Finance authorization revision, and Command expiry.
 */
export const WORLD_V2_CURRENT_BUYER_FINANCE_APPROVAL_QUERY = `
select
  approval.world_id,
  approval.buyer_country_id,
  approval.proposal_id,
  approval.approval_ref
from world_v2.narrow_transfer_approval_reference as approval
inner join world_v2.command_submission as command
  on command.world_id = approval.world_id
  and command.command_id = approval.command_id
  and command.command_fingerprint = approval.command_fingerprint
inner join world_v2.narrow_transfer_proposal as proposal
  on proposal.world_id = approval.world_id
  and proposal.proposal_id = approval.proposal_id
  and proposal.command_id = approval.command_id
  and proposal.command_fingerprint = approval.command_fingerprint
  and proposal.country_id = approval.buyer_country_id
  and proposal.status = 'APPROVED'
inner join world_v2.narrow_transfer_approval_signature as signature
  on signature.world_id = approval.world_id
  and signature.proposal_id = approval.proposal_id
  and signature.country_id = approval.buyer_country_id
  and signature.office_id = 'FINANCE'
  and signature.actor_id = approval.finance_actor_id
  and signature.auth_subject = approval.finance_auth_subject
  and signature.authorization_version = approval.finance_authorization_version
  and signature.signed_at_real = approval.finance_signed_at_real
inner join world_v2.current_commit_authorization as current_finance
  on current_finance.world_id = approval.world_id
  and current_finance.auth_subject = approval.finance_auth_subject
  and current_finance.country_id = approval.buyer_country_id
  and current_finance.office_id = 'FINANCE'
  and current_finance.capability = 'FINANCE_TREASURY'
  and current_finance.authorization_version = approval.finance_authorization_version
  and current_finance.active
where approval.world_id = $1
  and approval.buyer_country_id = $2
  and approval.command_id = $3
  and approval.proposal_id = ('BUYER_APPROVAL_' || $3)
  and approval.approval_ref = $4
  and approval.proposal_id = $5
  and command.command_type = 'CORE_GOODS_TRANSFER_V1'
  and (command.canonical_payload::jsonb ->> 'buyerCountryId') = approval.buyer_country_id
  and (command.canonical_payload::jsonb ->> 'paymentSource') = 'BUYER_TREASURY_GCU'
  and (command.canonical_payload::jsonb ->> 'expiresAtReal')::timestamptz > current_timestamp
limit 2
`.trim();

const ROW_KEYS = Object.freeze([
  'approval_ref',
  'buyer_country_id',
  'proposal_id',
  'world_id',
]);

type CurrentBuyerFinanceApproval = NonNullable<
  Awaited<ReturnType<BuyerFinanceApprovalReader['readCurrent']>>
>;

function malformedBinding(message: string): never {
  throw new Error(`POSTGRES_BUYER_FINANCE_APPROVAL_READER_INVALID: ${message}`);
}

function exactApproval(
  value: unknown,
  expected: {
    readonly worldId: string;
    readonly buyerCountryId: string;
    readonly commandId: string;
    readonly proposalRef: string;
    readonly buyerFinanceApprovalRef: string;
  },
): CurrentBuyerFinanceApproval {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    malformedBinding('PostgreSQL approval row must be an object');
  }
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  if (
    keys.length !== ROW_KEYS.length ||
    keys.some((key, index) => key !== ROW_KEYS[index]) ||
    row.world_id !== expected.worldId ||
    row.buyer_country_id !== expected.buyerCountryId ||
    row.proposal_id !== expected.proposalRef ||
    row.proposal_id !== `BUYER_APPROVAL_${expected.commandId}` ||
    row.approval_ref !== expected.buyerFinanceApprovalRef
  ) {
    malformedBinding(
      'PostgreSQL approval row does not match the exact request',
    );
  }
  return Object.freeze({
    worldId: expected.worldId,
    buyerCountryId: expected.buyerCountryId,
    officeId: 'FINANCE' as const,
    proposalRef: expected.proposalRef,
    approvalRef: expected.buyerFinanceApprovalRef,
    status: 'APPROVED' as const,
  });
}

/**
 * Constructs an exact, parameterized reader over a pool that is held by the
 * API process. The caller is responsible for supplying a least-privilege
 * server role; this module accepts no browser identity, arbitrary SQL, or
 * browser-provided RLS settings.
 */
export function createPostgresBuyerFinanceApprovalReader(input: {
  readonly pool: Pick<Pool, 'query'>;
}): Readonly<BuyerFinanceApprovalReader> {
  return Object.freeze({
    async readCurrent(
      request: Parameters<BuyerFinanceApprovalReader['readCurrent']>[0],
    ) {
      if (request.signal?.aborted) {
        malformedBinding('approval query was cancelled before execution');
      }
      const result = await input.pool.query(
        WORLD_V2_CURRENT_BUYER_FINANCE_APPROVAL_QUERY,
        [
          request.worldId,
          request.buyerCountryId,
          request.commandId,
          request.buyerFinanceApprovalRef,
          request.proposalRef,
        ],
      );
      if (request.signal?.aborted || result.rows.length !== 1) return null;
      return exactApproval(result.rows[0], request);
    },
  });
}
