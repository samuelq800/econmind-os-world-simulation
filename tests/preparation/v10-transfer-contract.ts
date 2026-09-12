import { createHash } from 'node:crypto';

import {
  COMMAND_SCHEMA_VERSION,
  COMMODITY_ENTRIES,
  Price,
  Quantity,
  countryId,
  createApprovalProposal,
  officeId,
  parseCanonicalCommand,
  proposalId,
  type ApprovalProposal,
} from '../../packages/core/src/index.js';

// Test policy only: ADR-09 approval and the production resolver are still pending.
export const V10_TEST_POLICY = 'TEST_ONLY_UNAPPROVED_V10_TREASURY_V1';
export const V10_PREPARATION = 'PREPARATION_ONLY_NOT_V10_STARTED';

export const sha256 = (input: string) =>
  createHash('sha256').update(input, 'utf8').digest('hex');

export function transferTerms() {
  const grain = COMMODITY_ENTRIES.find((entry) => entry.id === 'GRAIN');
  if (grain?.unit === undefined)
    throw new Error('Registered GRAIN unit missing');
  return {
    commodityId: grain.id,
    sellerCountryId: 'COUNTRY_SELLER_TEST',
    buyerCountryId: 'COUNTRY_BUYER_TEST',
    quantity: Quantity.from('2', grain.unit).toCanonicalValue(),
    price: Price.from('3', 'GCU', grain.unit).toCanonicalValue(),
    paymentSource: 'BUYER_TREASURY_GCU',
    policyVersion: V10_TEST_POLICY,
    // Country is part of each required signature; TRADE is not globally unique.
    requiredSignatures: [
      { countryId: 'COUNTRY_SELLER_TEST', officeId: 'TRADE' },
      { countryId: 'COUNTRY_BUYER_TEST', officeId: 'TRADE' },
      { countryId: 'COUNTRY_BUYER_TEST', officeId: 'FINANCE' },
    ],
  };
}

export function transferInput(payload: unknown = transferTerms()) {
  return {
    schemaVersion: COMMAND_SCHEMA_VERSION,
    commandType: 'CORE_GOODS_TRANSFER_V1',
    commandId: 'COMMAND_TRANSFER_TEST',
    idempotencyKey: 'IDEMPOTENCY_TRANSFER_TEST',
    worldId: 'WORLD_TRANSFER_TEST',
    actorId: 'ACTOR_SELLER_TEST',
    authSubject: '11111111-1111-4111-8111-111111111111',
    countryId: 'COUNTRY_SELLER_TEST',
    officeId: 'TRADE',
    expectedWorldVersion: '0',
    simTime: '10000',
    submittedAtReal: '2026-09-12T00:00:00.000Z',
    correlationId: 'CORRELATION_TRANSFER_TEST',
    payload,
  };
}

export function transferCommand(payload: unknown = transferTerms()) {
  return parseCanonicalCommand(transferInput(payload), sha256);
}

export function transferProposals() {
  const command = transferCommand();
  // This is a fixed synthetic scenario builder, not an untrusted-input parser.
  const terms = transferTerms();
  const seller = createApprovalProposal({
    id: proposalId('PROPOSAL_SELLER_TEST'),
    version: 'VERSION_1',
    worldId: command.worldId,
    countryId: countryId(terms.sellerCountryId),
    payloadFingerprint: command.fingerprint,
    resolution: {
      policyVersion: V10_TEST_POLICY,
      requiredOffices: [officeId('TRADE')],
    },
  });
  const buyer = createApprovalProposal({
    id: proposalId('PROPOSAL_BUYER_TEST'),
    version: 'VERSION_1',
    worldId: command.worldId,
    countryId: countryId(terms.buyerCountryId),
    payloadFingerprint: command.fingerprint,
    resolution: {
      policyVersion: V10_TEST_POLICY,
      requiredOffices: [officeId('TRADE'), officeId('FINANCE')],
    },
  });
  return { seller, buyer };
}

export function decisionScope(proposal: ApprovalProposal) {
  return {
    proposalId: proposal.id,
    proposalVersion: proposal.version,
    worldId: proposal.worldId,
    countryId: proposal.countryId,
    payloadFingerprint: proposal.payloadFingerprint,
    policyVersion: proposal.policyVersion,
    requiredOffices: proposal.requiredOffices,
  };
}
