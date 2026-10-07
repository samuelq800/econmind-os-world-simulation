import { describe, expect, it } from 'vitest';
import {
  authenticateIdentity,
  authSubject,
  countryId,
  officeId,
  teamId,
  worldId,
  type MembershipSnapshot,
} from '@econmind/core';
import {
  prepareNonHostIsolatedSeats,
  isolatedSeatStillCurrent,
  nonHostAutomaticExecutionAllowed,
} from '../../apps/world-api/src/integration/non-host-isolated-seat-policy.js';
const WORLD = 'WORLD_TEST_ONLY_SEATS',
  SUBJECT = '11111111-1111-4111-8111-111111111111';
async function fixture() {
  const principal = await authenticateIdentity({
    token: 'TEST_ONLY',
    profile: { user_id: SUBJECT, display_name: null, school_id: null },
    verifier: {
      verify: async () => ({
        subject: SUBJECT,
        issuer: 'TEST_ONLY',
        audience: 'TEST_ONLY',
        issuedAt: '2026-10-07T00:00:00.000Z',
        expiresAt: '2026-10-09T00:00:00.000Z',
      }),
    },
  });
  const state: { membership: MembershipSnapshot } = {
    membership: {
      authSubject: authSubject(SUBJECT),
      worldId: worldId(WORLD),
      countryId: countryId('COUNTRY_01'),
      teamId: teamId('TEAM_TEST_ONLY'),
      officeAssignments: [officeId('FINANCE')],
      active: true,
      suspended: false,
      isWorldAdmin: true,
      authorizationVersion: 'REV_TEST_ONLY',
      negotiationPartyIds: [],
    },
  };
  const approvals: string[] = [];
  const input = {
    environment: 'TEST_ONLY_ISOLATED' as const,
    worldId: WORLD,
    principal,
    resolver: {
      resolveCurrentIdentity: async () => principal.authSubject,
      resolveCurrentMembership: async () => state.membership,
    },
    source: {
      readEligibleCountries: async () =>
        ['COUNTRY_03', 'COUNTRY_02', 'COUNTRY_01'].map((countryId) => ({
          countryId,
          openingValidated: true,
          operationAccountsAndInventoryPresent: true,
        })),
      readCurrentOfficeApproval: async (r: {
        countryId: string;
        officeId: string;
      }) => {
        approvals.push(`${r.countryId}.${r.officeId}`);
        return {
          approvalRef: `APPROVAL_${r.countryId}_${r.officeId}`,
          revoked: false,
        };
      },
    },
    nowReal: '2026-10-07T00:00:00.000Z',
    purpose: 'TEST_ONLY_EXISTING_CHAIN',
  };
  return { input, state, approvals };
}
describe('non-host Owner D06 restrictions, TEST_ONLY preparation', () => {
  it('selects first two actual eligible canonical countries and six separately approved Offices', async () => {
    const f = await fixture();
    const r = await prepareNonHostIsolatedSeats(f.input);
    expect(r.status).toBe('PREPARED_NOT_GRANTED');
    expect(r.authorizationGranted).toBe(false);
    expect(r.seats).toHaveLength(12);
    expect(f.approvals).toHaveLength(12);
    expect([...new Set(r.seats.map((s) => s.countryId))]).toEqual([
      'COUNTRY_01',
      'COUNTRY_02',
    ]);
    expect(
      r.seats.every(
        (s) =>
          s.expiresAtReal === '2026-10-08T00:00:00.000Z' && !('seatRef' in s),
      ),
    ).toBe(true);
  });
  it('missing admin, platform-only identity, expired session and suspended membership never grant', async () => {
    const f = await fixture();
    expect(
      (await prepareNonHostIsolatedSeats({ ...f.input, principal: null }))
        .status,
    ).toBe('DENIED');
    f.state.membership = { ...f.state.membership, isWorldAdmin: false };
    expect((await prepareNonHostIsolatedSeats(f.input)).status).toBe('DENIED');
    f.state.membership = {
      ...f.state.membership,
      isWorldAdmin: true,
      suspended: true,
    };
    expect((await prepareNonHostIsolatedSeats(f.input)).status).toBe('DENIED');
    expect(
      (
        await prepareNonHostIsolatedSeats({
          ...f.input,
          nowReal: '2026-10-09T00:00:00.000Z',
        })
      ).status,
    ).toBe('DENIED');
  });
  it('missing one Office approval, revoked approval, insufficient admitted countries and duplicate source deny', async () => {
    const f = await fixture();
    for (const source of [
      { ...f.input.source, readCurrentOfficeApproval: async () => null },
      {
        ...f.input.source,
        readCurrentOfficeApproval: async () => ({
          approvalRef: 'APPROVAL_TEST_ONLY',
          revoked: true,
        }),
      },
      {
        ...f.input.source,
        readEligibleCountries: async () => [
          {
            countryId: 'COUNTRY_01',
            openingValidated: false,
            operationAccountsAndInventoryPresent: true,
          },
        ],
      },
      {
        ...f.input.source,
        readEligibleCountries: async () =>
          [1, 2].map(() => ({
            countryId: 'COUNTRY_01',
            openingValidated: true,
            operationAccountsAndInventoryPresent: true,
          })),
      },
      {
        ...f.input.source,
        readCurrentOfficeApproval: async () => ({
          approvalRef: 'ONE_APPROVAL_FOR_ALL',
          revoked: false,
        }),
      },
    ])
      expect(
        (await prepareNonHostIsolatedSeats({ ...f.input, source })).status,
      ).toBe('DENIED');
  });
  it('checks exact real 24h TTL, revocation and boundary without simulation time', () => {
    const r = {
      issuedAtReal: '2026-10-07T00:00:00.000Z',
      expiresAtReal: '2026-10-08T00:00:00.000Z',
      nowReal: '2026-10-07T23:59:59.999Z',
      revoked: false,
    };
    expect(isolatedSeatStillCurrent(r)).toBe(true);
    expect(isolatedSeatStillCurrent({ ...r, revoked: true })).toBe(false);
    expect(isolatedSeatStillCurrent({ ...r, nowReal: r.expiresAtReal })).toBe(
      false,
    );
    expect(
      isolatedSeatStillCurrent({
        ...r,
        expiresAtReal: '2026-10-09T00:00:00.000Z',
      }),
    ).toBe(false);
  });
  it('all NPC and PREOPEN/PAUSED execution disabled; SYSTEM cannot approve or create policy', () => {
    const r = {
      phase: 'ACTIVE' as const,
      actor: 'SYSTEM' as const,
      operation: 'EXISTING_RULE_SETTLEMENT' as const,
      existingObligationRef: 'OBLIGATION_TEST_ONLY',
      effectiveRuleVersion: 'RULE_1',
      causationRef: 'CAUSE_TEST_ONLY',
    };
    expect(nonHostAutomaticExecutionAllowed(r)).toBe(true);
    for (const override of [
      { actor: 'NPC' as const },
      { phase: 'PREOPEN' as const },
      { phase: 'PAUSED' as const },
      { operation: 'APPROVAL' as const },
      { operation: 'NEW_ORDER' as const },
      { operation: 'NEW_POLICY' as const },
      { effectiveRuleVersion: null },
    ])
      expect(nonHostAutomaticExecutionAllowed({ ...r, ...override })).toBe(
        false,
      );
  });
});
