import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  assertAuthorizationRevocationCurrent,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
} from '@econmind/core';
import { serverHeldAuthorizationGuard } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  V10_COMMIT_AUTHORIZATION_FIXTURE_VERSION,
  createV10CommitAuthorizationFixture,
} from './v10-commit-authorization-fixture.js';

const noOpTransaction: SqlExecutor = Object.freeze({
  async query() {
    return Object.freeze({ rowCount: 0, rows: Object.freeze([]) });
  },
});

describe('V10.2 commit authorization fixture', () => {
  it('keeps an active seller Trade authorization current at the commit boundary', async () => {
    const fixture = createV10CommitAuthorizationFixture();
    const proof = await fixture.issueCommitAuthorizationProof();

    expect(fixture.fixtureVersion).toBe(
      V10_COMMIT_AUTHORIZATION_FIXTURE_VERSION,
    );
    expect(isCommitAuthorizationProof(proof)).toBe(true);
    expect(proof).toMatchObject({
      commandId: fixture.command.commandId,
      commandFingerprint: fixture.command.fingerprint,
      authorizationVersion: fixture.initialAuthorizationVersion,
      capability: fixture.capability,
    });
    await expect(reauthorizeCommitAuthorizationProof(proof)).resolves.toBe(
      undefined,
    );
    await expect(
      serverHeldAuthorizationGuard.assertCurrent(noOpTransaction, {
        command: fixture.command,
        authorityKind: 'DISCRETIONARY_USER',
        proof,
        expected: 'AUTHORIZED',
      }),
    ).resolves.toBe(undefined);
  });

  it('fails closed when the issued membership becomes suspended or revoked', async () => {
    const suspended = createV10CommitAuthorizationFixture();
    const suspendedProof = await suspended.issueCommitAuthorizationProof();
    suspended.suspend();
    await expect(
      reauthorizeCommitAuthorizationProof(suspendedProof),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
    await expect(
      serverHeldAuthorizationGuard.assertCurrent(noOpTransaction, {
        command: suspended.command,
        authorityKind: 'DISCRETIONARY_USER',
        proof: suspendedProof,
        expected: 'AUTHORIZED',
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });

    const revoked = createV10CommitAuthorizationFixture();
    const revokedIssued = await revoked.issueAuthorization();
    const revokedProof = await revoked.issueCommitAuthorizationProof();
    revoked.revoke();
    await expect(
      reauthorizeCommitAuthorizationProof(revokedProof),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
    const revocationReceipt =
      await revoked.issueAuthorizationRevocationReceipt(revokedIssued);
    await expect(
      assertAuthorizationRevocationCurrent(revocationReceipt),
    ).resolves.toBe(undefined);
    await expect(
      serverHeldAuthorizationGuard.assertCurrent(noOpTransaction, {
        command: revoked.command,
        authorityKind: 'DISCRETIONARY_USER',
        proof: null,
        expected: 'REVOKED',
        revokedReceipt: revocationReceipt,
      }),
    ).resolves.toBe(undefined);
  });

  it('rejects a proof after its authorization revision changes', async () => {
    const fixture = createV10CommitAuthorizationFixture();
    const proof = await fixture.issueCommitAuthorizationProof();
    fixture.revise();

    expect(fixture.currentMembership()).toMatchObject({
      authorizationVersion: fixture.changedAuthorizationVersion,
    });
    await expect(
      reauthorizeCommitAuthorizationProof(proof),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
    await expect(
      serverHeldAuthorizationGuard.assertCurrent(noOpTransaction, {
        command: fixture.command,
        authorityKind: 'DISCRETIONARY_USER',
        proof,
        expected: 'AUTHORIZED',
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
  });

  it('does not revive old proof or revocation evidence after authorization restoration', async () => {
    const fixture = createV10CommitAuthorizationFixture();
    const oldProof = await fixture.issueCommitAuthorizationProof();
    const oldIssued = await fixture.issueAuthorization();
    fixture.revoke();
    const revocationReceipt =
      await fixture.issueAuthorizationRevocationReceipt(oldIssued);
    fixture.restore();

    expect(fixture.currentMembership()).toMatchObject({
      authorizationVersion: fixture.restoredAuthorizationVersion,
      active: true,
      suspended: false,
    });
    await expect(
      reauthorizeCommitAuthorizationProof(oldProof),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
    await expect(
      assertAuthorizationRevocationCurrent(revocationReceipt),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
    await expect(
      serverHeldAuthorizationGuard.assertCurrent(noOpTransaction, {
        command: fixture.command,
        authorityKind: 'DISCRETIONARY_USER',
        proof: null,
        expected: 'REVOKED',
        revokedReceipt: revocationReceipt,
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });

    const restoredProof = await fixture.issueCommitAuthorizationProof();
    await expect(
      reauthorizeCommitAuthorizationProof(restoredProof),
    ).resolves.toBe(undefined);
  });
});
