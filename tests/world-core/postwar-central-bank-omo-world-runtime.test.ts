/** Actual Root Atomic commands under two real independent TEST_ONLY country
 * sources. This is an embedded SQL test, not a native PG/HTTP/production claim. */
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createPostwarCentralBankWorldAtomicFixture } from '../support/postwar-central-bank-world-atomic-fixture.js';
import {
  isPostwarCentralBankOmoRuntime,
  isPostwarCentralBankOmoSourceCommitProtectionPort,
} from '../../apps/world-worker/src/persistence/postwar-central-bank-omo-runtime.js';
import {
  CB_ATOMIC_TEST_AT as at,
  cbAtomicTestSha as sha,
} from '../support/postwar-central-bank-omo-atomic-fixture.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
function reCountry(c: C.CanonicalCommand, country: string) {
  return C.parseCanonicalCommand(
    {
      schemaVersion: c.schemaVersion,
      worldId: c.worldId,
      countryId: country,
      commandId: c.commandId + '_SCOPE',
      idempotencyKey: c.idempotencyKey + '_SCOPE',
      expectedWorldVersion: c.expectedWorldVersion,
      actorId: c.actorId,
      authSubject: c.authSubject,
      officeId: c.officeId,
      commandType: c.commandType,
      correlationId: c.correlationId,
      simTime: c.simTime.toCanonicalValue(),
      submittedAtReal: c.submittedAtReal,
      payload: JSON.parse(c.canonicalPayload),
    },
    sha,
  );
}
describe('genuine finite World CB runtime country selection and current Atomic cutoff', () => {
  it('commits country 01 then country 02 in one global prefix, refuses missing/unbound countries and recovers FINAL after revocation without duplicates', async () => {
    const f = await createPostwarCentralBankWorldAtomicFixture();
    try {
      expect(isPostwarCentralBankOmoRuntime(f.runtime)).toBe(true);
      expect(isPostwarCentralBankOmoRuntime({ ...f.runtime })).toBe(false);
      expect(
        isPostwarCentralBankOmoSourceCommitProtectionPort(
          f.runtime.sourceCommitProtectionPort,
        ),
      ).toBe(true);
      expect(
        isPostwarCentralBankOmoSourceCommitProtectionPort({
          ...f.runtime.sourceCommitProtectionPort,
        }),
      ).toBe(false);
      expect(f.runtime.clock).toBe(f.clock);
      expect(f.runtime.countryIds).toEqual([
        'COUNTRY_01',
        'COUNTRY_02',
        'COUNTRY_03',
      ]);
      expect(
        (
          await f.database.transaction((tx) =>
            tx.query(
              "select has_any_column_privilege(current_user,'world_v2.current_commit_authorization','UPDATE')as auth_update,has_any_column_privilege(current_user,'world_v2.projection_entitlement','UPDATE')as entitlement_update,has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')as raw_seed",
            ),
          )
        ).rows,
      ).toEqual([
        { auth_update: false, entitlement_update: false, raw_seed: false },
      ]);
      const count = async () =>
        (
          await f.db.query<{
            version: string;
            sequence: string;
            events: number;
            batches: number;
            receipts: number;
            commands: number;
            audit: number;
          }>(
            `select world_version::text as version,event_sequence::text as sequence,(select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.financial_posting_batch)as batches,(select count(*)::int from world_v2.command_receipt)as receipts,(select count(*)::int from world_v2.command_submission)as commands,(select count(*)::int from world_v2.authoritative_commit_authorization)as audit from world_v2.world_head`,
          )
        ).rows[0]!;
      const empty = await count();
      await expect(
        f.runtime.preflight(reCountry(f.command, 'COUNTRY_03'), at),
      ).rejects.toMatchObject({
        missing: ['CB_OMO_INDEPENDENT_SOURCE_ADOPTION_REQUIRED'],
      });
      const reads = f.queries.length;
      await expect(
        f.runtime.preflight(reCountry(f.command, 'COUNTRY_70'), at),
      ).rejects.toMatchObject({ missing: ['COUNTRY_NOT_BOUND_TO_CB_RUNTIME'] });
      expect(f.queries).toHaveLength(reads);
      expect(await count()).toEqual(empty);
      const first = await f.execution.executeQueuedCommand(f.input);
      expect(first.source).toBe('NEW_FINAL');
      expect(first.receipt.outcome).toBe('COMMITTED');
      await f.enqueueSecond();
      await f.runtime.preflight(f.second.command, at);
      const second = await f.execution.executeQueuedCommand(f.secondInput);
      expect(second.source).toBe('NEW_FINAL');
      expect(second.receipt.outcome).toBe('COMMITTED');
      const after = await count();
      expect(after).toEqual({
        version: '2',
        sequence: '2',
        events: 2,
        batches: 2,
        receipts: 2,
        commands: 2,
        audit: 2,
      });
      expect(
        f.queries.some((sql) =>
          sql.includes('lock_postwar_central_bank_current_authorization'),
        ),
      ).toBe(true);
      const rebuilt = await new DurableV08LedgerLineageReader({
        database: f.admin,
        sha256Hex: sha,
      }).rebuild(f.seed.worldId);
      for (const original of [
        f.original,
        { bankAccounts: f.second.facts.bankAccounts },
      ])
        expect(
          rebuilt.financial.positions
            .find(
              (p) =>
                p.account.accountId ===
                original.bankAccounts.reservesAtCentralBank,
            )
            ?.netDebitBalance.toCanonicalValue(),
        ).toEqual({ amount: '101.25', currency: 'GBP' });
      await f.revoke('SOURCE');
      await expect(f.runtime.preflight(f.command, at)).rejects.toMatchObject({
        missing: ['CB_OMO_SOURCE_REVOKED'],
      });
      expect((await f.execution.executeQueuedCommand(f.input)).source).toBe(
        'EXISTING_FINAL',
      );
      expect(
        (await f.execution.executeQueuedCommand(f.secondInput)).source,
      ).toBe('EXISTING_FINAL');
      expect(await count()).toEqual(after);
      await f.runtime.close();
      await expect(
        f.runtime.preflight(f.second.command, at),
      ).rejects.toMatchObject({ missing: ['WORLD_CB_SOURCE_RETIRED'] });
      expect(
        (await f.execution.executeQueuedCommand(f.secondInput)).source,
      ).toBe('EXISTING_FINAL');
      expect(await count()).toEqual(after);
    } finally {
      await f.runtime.close();
      await f.db.close();
    }
  });
});
