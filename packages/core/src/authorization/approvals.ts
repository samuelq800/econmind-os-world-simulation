import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import type {
  ActorId,
  CountryId,
  OfficeId,
  ProposalId,
  UserId,
  WorldId,
} from '../ids.js';
import type { AuthorizedOfficeContext } from './offices.js';
import {
  isAuthorizedOfficeContext,
  OFFICE_APPROVAL_CAPABILITY,
} from './offices.js';

export type ApprovalStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'INVALIDATED' | 'SUPERSEDED';

export interface RequiredOfficesResolution {
  readonly policyVersion: string;
  readonly requiredOffices: readonly OfficeId[];
}

export interface RequiredOfficesResolver<Input> {
  resolve(input: Input): RequiredOfficesResolution;
}

export interface OfficeSignature {
  readonly officeId: OfficeId;
  readonly actorId: ActorId;
  readonly userId: UserId;
  readonly authorizationVersion: string;
  readonly signedAt: string;
}

export interface ApprovalProposal {
  readonly id: ProposalId;
  readonly version: string;
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly payloadFingerprint: string;
  readonly policyVersion: string;
  readonly requiredOffices: readonly OfficeId[];
  readonly signatures: readonly OfficeSignature[];
  readonly status: ApprovalStatus;
  readonly supersedesId: ProposalId | null;
  readonly rejectedByOfficeId: OfficeId | null;
}

function approvalError(
  code: keyof Pick<
    typeof DOMAIN_ERROR_CODES,
    'APPROVAL_INVALIDATED' | 'APPROVAL_REJECTED' | 'APPROVAL_VERSION_MISMATCH'
  >,
  message: string,
): never {
  throw new DomainError(DOMAIN_ERROR_CODES[code], message);
}

function uniqueOffices(offices: readonly OfficeId[]): readonly OfficeId[] {
  const unique = [...new Set(offices)];
  if (unique.length === 0 || unique.length !== offices.length)
    approvalError(
      'APPROVAL_VERSION_MISMATCH',
      'Required Offices must be non-empty and unique',
    );
  return Object.freeze(unique);
}

export function createApprovalProposal(input: {
  readonly id: ProposalId;
  readonly version: string;
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly payloadFingerprint: string;
  readonly resolution: RequiredOfficesResolution;
  readonly supersedesId?: ProposalId;
}): ApprovalProposal {
  return Object.freeze({
    id: input.id,
    version: input.version,
    worldId: input.worldId,
    countryId: input.countryId,
    payloadFingerprint: input.payloadFingerprint,
    policyVersion: input.resolution.policyVersion,
    requiredOffices: uniqueOffices(input.resolution.requiredOffices),
    signatures: Object.freeze([]),
    status: 'PENDING',
    supersedesId: input.supersedesId ?? null,
    rejectedByOfficeId: null,
  });
}

function assertCanDecide(
  proposal: ApprovalProposal,
  context: AuthorizedOfficeContext,
  expectedVersion: string,
) {
  if (!isAuthorizedOfficeContext(context)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      'Office context was not issued by server authorization',
    );
  }
  if (proposal.status === 'REJECTED')
    approvalError(
      'APPROVAL_REJECTED',
      'Rejected proposal cannot be resurrected',
    );
  if (proposal.status !== 'PENDING')
    approvalError('APPROVAL_INVALIDATED', `Proposal is ${proposal.status}`);
  if (proposal.version !== expectedVersion)
    approvalError('APPROVAL_VERSION_MISMATCH', 'Proposal version mismatch');
  if (
    context.capability !== OFFICE_APPROVAL_CAPABILITY ||
    context.worldId !== proposal.worldId ||
    context.countryId !== proposal.countryId ||
    !proposal.requiredOffices.includes(context.officeId)
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      'Office context cannot decide this proposal',
    );
  }
}

export function signApprovalProposal(input: {
  readonly proposal: ApprovalProposal;
  readonly context: AuthorizedOfficeContext;
  readonly actorId: ActorId;
  readonly expectedVersion: string;
  readonly signedAt: string;
}): ApprovalProposal {
  assertCanDecide(input.proposal, input.context, input.expectedVersion);
  if (
    input.proposal.signatures.some(
      (item) => item.officeId === input.context.officeId,
    )
  )
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      'Office already signed this proposal version',
    );
  const signatures = Object.freeze([
    ...input.proposal.signatures,
    Object.freeze({
      officeId: input.context.officeId,
      actorId: input.actorId,
      userId: input.context.userId,
      authorizationVersion: input.context.authorizationVersion,
      signedAt: input.signedAt,
    }),
  ]);
  const complete = input.proposal.requiredOffices.every((office) =>
    signatures.some((signature) => signature.officeId === office),
  );
  return Object.freeze({
    ...input.proposal,
    signatures,
    status: complete ? 'APPROVED' : 'PENDING',
  });
}

export function rejectApprovalProposal(input: {
  readonly proposal: ApprovalProposal;
  readonly context: AuthorizedOfficeContext;
  readonly expectedVersion: string;
}): ApprovalProposal {
  assertCanDecide(input.proposal, input.context, input.expectedVersion);
  return Object.freeze({
    ...input.proposal,
    status: 'REJECTED',
    rejectedByOfficeId: input.context.officeId,
  });
}

export function invalidateApprovalProposal(
  proposal: ApprovalProposal,
): ApprovalProposal {
  if (proposal.status !== 'PENDING')
    approvalError(
      'APPROVAL_INVALIDATED',
      `Cannot invalidate ${proposal.status} proposal`,
    );
  return Object.freeze({ ...proposal, status: 'INVALIDATED' });
}

export function reviseApprovalProposal(input: {
  readonly proposal: ApprovalProposal;
  readonly id: ProposalId;
  readonly version: string;
  readonly payloadFingerprint: string;
  readonly resolution: RequiredOfficesResolution;
}): {
  readonly previous: ApprovalProposal;
  readonly revised: ApprovalProposal;
} {
  if (
    input.proposal.status === 'APPROVED' ||
    input.proposal.status === 'INVALIDATED'
  )
    approvalError(
      'APPROVAL_INVALIDATED',
      `Cannot revise ${input.proposal.status} proposal`,
    );
  const previous =
    input.proposal.status === 'PENDING'
      ? Object.freeze({ ...input.proposal, status: 'SUPERSEDED' as const })
      : input.proposal;
  return Object.freeze({
    previous,
    revised: createApprovalProposal({
      id: input.id,
      version: input.version,
      worldId: input.proposal.worldId,
      countryId: input.proposal.countryId,
      payloadFingerprint: input.payloadFingerprint,
      resolution: input.resolution,
      supersedesId: input.proposal.id,
    }),
  });
}
