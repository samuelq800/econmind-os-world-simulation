/** Genuine fixed CB custody -> Root authoritative execution/Atomic -> persisted
 * event, posting, receipt and exact FINAL recovery. No hand-written COMMITTED
 * history, bypassed trigger, production source or native-PG claim. */
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  createCentralBankOmoAtomicFixture,
  cbAtomicTestSha,
  CB_ATOMIC_TEST_WORKER,
} from '../support/postwar-central-bank-omo-atomic-fixture.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';

const empty = {
  events: 0,
  batches: 0,
  receipts: 0,
  finalized: 0,
  audit: 0,
  outbox: 0,
  inventory: 0,
  materials: 0,
  version: '0',
  sequence: '0',
  queue: 'CLAIMED',
};
describe('Root Atomic CB OMO with actual TEST_ONLY custody and official economic SQL', () => {
  it('commits four decimal legs atomically and recovers exact FINAL after source revocation without any new source call', async () => {
    const f = await createCentralBankOmoAtomicFixture();
    try {
      const prepared = await f.prepareDraft();
      expect(await f.counts()).toEqual(empty);
      const committed = await f.execution.executeQueuedCommand(f.input);
      expect(committed.source).toBe('NEW_FINAL');
      expect(committed.receipt.outcome).toBe('COMMITTED');
      const after = await f.counts();
      expect(after).toEqual({
        events: 1,
        batches: 1,
        receipts: 1,
        finalized: 1,
        audit: 1,
        outbox: 1,
        inventory: 0,
        materials: 0,
        version: '1',
        sequence: '1',
        queue: 'FINALIZED',
      });
      const stored = await f.db.query<{ canonical_payload: string }>(
        'select canonical_payload from world_v2.financial_posting_batch',
      );
      const body = JSON.parse(stored.rows[0]!.canonical_payload) as {
        legs: { amount: { amount: string; currency: string } }[];
      };
      expect(body.legs).toHaveLength(4);
      expect(body.legs.map((l) => l.amount.amount)).toEqual([
        '1.25',
        '1.25',
        '1.25',
        '1.25',
      ]);
      const rebuilt = await new DurableV08LedgerLineageReader({
        database: f.admin,
        sha256Hex: cbAtomicTestSha,
      }).rebuild(f.seed.worldId);
      const balance = (id: string) =>
        rebuilt.financial.positions
          .find((p) => p.account.accountId === id)
          ?.netDebitBalance.amount.toString();
      expect(balance(f.original.bankAccounts.reservesAtCentralBank!)).toBe(
        '101.25',
      );
      expect(balance(f.original.bankAccounts.governmentSecurities!)).toBe(
        '98.75',
      );
      expect(
        balance(f.original.centralBankAccounts.commercialBankReserves!),
      ).toBe('-101.25');
      expect(
        balance(f.original.centralBankAccounts.governmentSecurities!),
      ).toBe('101.25');
      await f.revoke('SOURCE');
      const sourceCalls = f.queries.filter((q) =>
        q.includes('lock_central_bank_omo_originals'),
      ).length;
      const repeated = await f.execution.executeQueuedCommand(f.input);
      expect(repeated.source).toBe('EXISTING_FINAL');
      expect(C.canonicalSerialize(repeated.receipt)).toBe(
        C.canonicalSerialize(committed.receipt),
      );
      // Exercise repository's own early receipt path as well as the outer
      // command processor: malformed fresh-use metadata cannot obstruct FINAL.
      const draft = { ...prepared.draft };
      Object.defineProperty(draft, 'officeOperatingSourceReadBinding', {
        get() {
          throw Error('fresh source getter must never run');
        },
      });
      const exact = await f.execution.repository.commit(
        prepareAtomicTransitionCandidate({
          command: f.command,
          commitAuthorization: prepared.proof,
          draft,
          sha256Hex: cbAtomicTestSha,
        }),
      );
      expect(exact.source).toBe('EXISTING_COMMIT');
      expect(C.canonicalSerialize(exact.receipt)).toBe(
        C.canonicalSerialize(committed.receipt),
      );
      expect(
        f.queries.filter((q) => q.includes('lock_central_bank_omo_originals'))
          .length,
      ).toBe(sourceCalls);
      expect(await f.counts()).toEqual(after);
      await expect(
        f.database.transaction((tx) =>
          tx.query('select * from world_v2.opening_seed'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        f.database.transaction((tx) =>
          tx.query(
            'update world_v2.current_commit_authorization set authorization_version=authorization_version',
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await f.db.close();
    }
  });
  it.each(['SOURCE', 'QUOTE'] as const)(
    'rolls back all actual Atomic effects when %s is revoked after Core preparation',
    async (resource) => {
      const f = await createCentralBankOmoAtomicFixture();
      try {
        const prepared = await f.prepareDraft();
        await f.revoke(resource);
        const candidate = prepareAtomicTransitionCandidate({
          command: f.command,
          commitAuthorization: prepared.proof,
          draft: prepared.draft,
          sha256Hex: cbAtomicTestSha,
        });
        await expect(
          f.execution.repository.commit(candidate),
        ).rejects.toMatchObject({
          missing: [
            resource === 'SOURCE'
              ? 'CB_OMO_SOURCE_REVOKED'
              : 'CB_OMO_QUOTE_REVOKED',
          ],
        });
        expect(await f.counts()).toEqual(empty);
      } finally {
        await f.db.close();
      }
    },
  );
  it('requires the genuine port for fresh native drafts and rejects a balanced but economically altered actual batch', async () => {
    const f = await createCentralBankOmoAtomicFixture();
    try {
      const prepared = await f.prepareDraft();
      expect(() =>
        createAuthoritativeWorkerExecution({
          database: f.database,
          workerId: CB_ATOMIC_TEST_WORKER,
          sha256Hex: cbAtomicTestSha,
          candidateFactory: f.runtime.factory,
          centralBankOmoSourceCommitProtectionPort: {
            ...f.runtime.sourceCommitProtectionPort,
          },
        }),
      ).toThrow('fixed runtime issuer');
      const legacy = createAuthoritativeWorkerExecution({
        database: f.database,
        workerId: CB_ATOMIC_TEST_WORKER,
        sha256Hex: cbAtomicTestSha,
        candidateFactory: f.runtime.factory,
      });
      await expect(
        legacy.repository.commit(
          prepareAtomicTransitionCandidate({
            command: f.command,
            commitAuthorization: prepared.proof,
            draft: prepared.draft,
            sha256Hex: cbAtomicTestSha,
          }),
        ),
      ).rejects.toThrow(
        'Fresh office execution requires its fixed source guard',
      );
      expect(await f.counts()).toEqual(empty);
      const original = prepared.draft.financialPostingBatches[0]!;
      const {
        fingerprint: _fp,
        transitionBinding: _binding,
        ...intent
      } = original;
      void _fp;
      void _binding;
      const altered = C.createFinancialPostingBatch(
        {
          ...intent,
          command: f.command,
          transition: prepared.draft.transition,
          legs: original.legs.map((l) => ({
            ...l,
            amount: C.Money.from('2.5', l.amount.currency),
          })),
        },
        cbAtomicTestSha,
      );
      await expect(
        f.execution.repository.commit(
          prepareAtomicTransitionCandidate({
            command: f.command,
            commitAuthorization: prepared.proof,
            draft: { ...prepared.draft, financialPostingBatches: [altered] },
            sha256Hex: cbAtomicTestSha,
          }),
        ),
      ).rejects.toThrow('CORE_EVENT_OR_ACTUAL_FINANCIAL_BATCH_DIFFERS');
      expect(await f.counts()).toEqual(empty);
    } finally {
      await f.db.close();
    }
  });
});
