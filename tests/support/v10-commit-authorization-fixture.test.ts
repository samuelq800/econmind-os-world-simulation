import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  isCommitAuthorizationProof,
  isAuthorizedOfficeContext,
} from '../../packages/core/src/index.js';
import {
  V10_COMMIT_AUTHORIZATION_FIXTURE_VERSION,
  createV10CommitAuthorizationFixture,
} from './v10-commit-authorization-fixture.js';

describe('V10.2 commit authorization fixture', () => {
  it('keeps an active seller Trade authorization current at the commit boundary', async () => {
    const fixture = createV10CommitAuthorizationFixture();
    const issued = await fixture.issueAuthorization();
    const proof = await fixture.issueCommitAuthorizationProof();
    const current = await fixture.assertIssuedAuthorizationCurrent(issued);

    expect(fixture.fixtureVersion).toBe(
      V10_COMMIT_AUTHORIZATION_FIXTURE_VERSION,
    );
    expect(isAuthorizedOfficeContext(current)).toBe(true);
    expect(isCommitAuthorizationProof(proof)).toBe(true);
    expect(proof).toMatchObject({
      commandId: fixture.command.commandId,
      commandFingerprint: fixture.command.fingerprint,
      authorizationVersion: fixture.initialAuthorizationVersion,
      capability: fixture.capability,
    });
    expect(current).toMatchObject({
      authorizationVersion: fixture.initialAuthorizationVersion,
      authSubject: fixture.command.authSubject,
      worldId: fixture.command.worldId,
      countryId: fixture.command.countryId,
      officeId: fixture.command.officeId,
      capability: fixture.capability,
    });
  });

  it('fails closed when the issued membership becomes suspended or revoked', async () => {
    const suspended = createV10CommitAuthorizationFixture();
    const suspendedIssued = await suspended.issueAuthorization();
    suspended.suspend();
    await expect(
      suspended.assertIssuedAuthorizationCurrent(suspendedIssued),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });

    const revoked = createV10CommitAuthorizationFixture();
    const revokedIssued = await revoked.issueAuthorization();
    revoked.revoke();
    await expect(
      revoked.assertIssuedAuthorizationCurrent(revokedIssued),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
  });

  it('marks an issued authorization stale after its authorization revision changes', async () => {
    const fixture = createV10CommitAuthorizationFixture();
    const issued = await fixture.issueAuthorization();
    fixture.revise();

    expect(fixture.currentMembership()).toMatchObject({
      authorizationVersion: fixture.changedAuthorizationVersion,
    });
    await expect(
      fixture.assertIssuedAuthorizationCurrent(issued),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
  });

  it('does not revive an old issuance after revocation and restoration', async () => {
    const fixture = createV10CommitAuthorizationFixture();
    const oldIssued = await fixture.issueAuthorization();
    fixture.revoke();
    fixture.restore();

    expect(fixture.currentMembership()).toMatchObject({
      authorizationVersion: fixture.restoredAuthorizationVersion,
      active: true,
      suspended: false,
    });
    await expect(
      fixture.assertIssuedAuthorizationCurrent(oldIssued),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });

    const restoredIssued = await fixture.issueAuthorization();
    await expect(
      fixture.assertIssuedAuthorizationCurrent(restoredIssued),
    ).resolves.toMatchObject({
      authorizationVersion: fixture.restoredAuthorizationVersion,
    });
  });
});
