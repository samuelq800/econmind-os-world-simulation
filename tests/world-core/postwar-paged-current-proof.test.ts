/** Genuine package Core page-proof lifecycle. Tiny TEST_ONLY rent source is
 * independently Core verified; no actor, PG admission or production authority. */
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  retireFinanceSocialReplayContinuation,
} from '@econmind/core/finance-social-replay-continuation';
import { createBeneficialHousingRentChildCoreFixture } from '../support/beneficial-housing-rent-child-test-only.js';
import {
  createPostwarPagedCurrentProof,
  advancePostwarPagedCurrentProof,
  readPostwarPagedCurrentProof,
  retirePostwarPagedCurrentProof,
} from '../../apps/world-worker/src/persistence/postwar-paged-current-proof.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const at = '2026-11-01T00:00:00.000Z';
function rentFrame(
  receipt: C.BeneficialHousingReclassificationReceipt,
  state: C.BeneficialHousingRentState,
  financial: C.FinancialLedgerState,
  index: string,
  tick: string,
) {
  const prepared = C.prepareBeneficialHousingRent(
    {
      receipt,
      state,
      financialBefore: financial,
      leaseId: receipt.leases[0]!.leaseId,
      periodIndex: index,
      simTime: C.SimTime.fromTicks(tick),
    },
    sha,
  );
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: receipt.worldId,
      countryId: receipt.countryId,
      officeId: null,
      commandType: C.BENEFICIAL_HOUSING_RENT_COMMAND,
      commandId: 'COMMAND_TEST_CURRENT_RENT_' + index,
      idempotencyKey: prepared.idempotencyKey,
      actorId: 'ACTOR_TEST_ONLY_RENT',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_TEST_RENT_' + index,
      expectedWorldVersion: financial.worldVersion,
      simTime: tick,
      submittedAtReal: at,
      payload: prepared.commandPayload,
    },
    sha,
  );
  const after = (BigInt(financial.worldVersion) + 1n).toString();
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST_RENT_' + index,
      eventType: C.BENEFICIAL_HOUSING_RENT_EVENT,
      worldId: receipt.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: after,
      sequence: after,
      simTime: tick,
      recordedAtReal: at,
      correctsEventId: null,
      payload: prepared.eventPayload,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    worldVersionBefore: financial.worldVersion,
    worldVersionAfter: after,
    events: [event],
  });
  const settled = C.settleBeneficialHousingRent(
    {
      receipt,
      state,
      financialBefore: financial,
      command,
      transition,
      leaseId: prepared.commandPayload.leaseId,
      periodIndex: index,
    },
    sha,
  );
  if (!settled.posting) throw Error('TEST_ONLY_NEW_PERIOD_REQUIRED');
  const final = C.createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: at,
  });
  return {
    frame: {
      command,
      transition,
      events: [event],
      receipt: final,
      financialPostingBatches: [settled.posting],
      inventoryPostings: [],
    },
    settled,
  };
}

it('collects only actual next Core pages, preserves complete journal meaning after cursor retirement and rejects DTO or consumed handles', () => {
  const f = createBeneficialHousingRentChildCoreFixture(1),
    receipt = f.receipts[0]!,
    opening = C.rebuildV08LedgersFromLineage({ seed: f.seed, sha256Hex: sha }),
    expectedHead = { worldVersion: '2', eventSequence: '2' };
  let cursor = prepareFinanceSocialReplayContinuation(
      {
        opening,
        socialCountries: [],
        openingEncumbrances: [],
        fxOriginals: [],
        beneficialHousingRentReceipts: f.receipts,
        expectedHead,
      },
      sha,
    ),
    proof = createPostwarPagedCurrentProof(cursor),
    financial = opening.financial,
    state = C.createBeneficialHousingRentState(receipt);
  expect(() => readPostwarPagedCurrentProof(proof)).toThrow(
    'COMPLETE_GENUINE_CORE_PREFIX_REQUIRED',
  );
  expect(() => createPostwarPagedCurrentProof(JSON.parse('{}'))).toThrow();
  for (let i = 0; i < 2; i++) {
    const actual = rentFrame(
        receipt,
        state,
        financial,
        String(i),
        String(11 + i * 10),
      ),
      prior = readFinanceSocialReplayContinuation(cursor),
      frames = [actual.frame],
      oldProof = proof;
    cursor = appendFinanceSocialReplayPage({
      continuation: cursor,
      page: {
        schemaVersion: 'finance-social-replay-page-v1',
        worldId: f.seed.worldId,
        seedFingerprint: f.seed.fingerprint,
        fromHead: prior.head,
        throughHead: {
          worldVersion: String(i + 1),
          eventSequence: String(i + 1),
        },
        expectedHead,
        frames,
        framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
      },
      sha256Hex: sha,
    });
    proof = advancePostwarPagedCurrentProof({ proof, continuation: cursor });
    expect(() => readPostwarPagedCurrentProof(oldProof)).toThrow(
      'GENUINE_LIVE_DATA_PROOF_REQUIRED',
    );
    expect(() =>
      advancePostwarPagedCurrentProof({ proof, continuation: cursor }),
    ).toThrow('SAME_GENUINE_NEXT_CORE_PAGE_REQUIRED');
    financial = actual.settled.financial;
    state = actual.settled.state;
  }
  const expectedPrefix =
    readFinanceSocialReplayContinuation(cursor).chainFingerprint;
  retireFinanceSocialReplayContinuation(cursor);
  const result = readPostwarPagedCurrentProof(proof);
  expect(result.coverage).toMatchObject({
    prefixFingerprint: expectedPrefix,
    financialPostingCount: '4',
    financialBatchCount: '2',
    pageProof: { pageCount: '2', frameCount: '2' },
  });
  expect(result.lastSocialCommandTypes).toEqual({});
  expect(Object.isFrozen(result.coverage.pageProof)).toBe(true);
  retirePostwarPagedCurrentProof(proof);
  expect(() => readPostwarPagedCurrentProof(proof)).toThrow(
    'GENUINE_LIVE_DATA_PROOF_REQUIRED',
  );
});
