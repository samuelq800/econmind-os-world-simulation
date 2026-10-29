/** Opt-in real cfc/new-World Treasury FX. No producer mocks, OP mandate,
 * production grant, clock advancement, reserve use or seed regeneration. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { publishPostwarDayOneFxOriginals } from '../../apps/world-worker/src/persistence/postgres-postwar-day-one-fx-originals.js';
import { PostgresOfficeCommandIntake } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import {
  createPostwarTreasuryFxRuntimeConnection,
  readPostwarTreasuryFxRuntimeBinding,
  type PostwarTreasuryFxRuntimeConnection,
} from '../../apps/world-worker/src/runtime-preparation/postwar-treasury-fx-runtime-connection.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import { createPostwarDayOneFxNativeFixture } from '../support/postwar-day-one-fx-native-fixture.js';
import type { FinancialIntakeBindingDto } from '@econmind/core/authenticated-financial-intake-contract';
import type { ManualOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const enabled = process.env.ECONMIND_POSTWAR_DAY_ONE_FX_NATIVE === '1';
const evidence = '/workspace/.cloud-setup/evidence/fx-cfc-runtime-20261029';
const root = path.resolve(import.meta.dirname, '../..');
describe('actual cfc Treasury FX fixed Worker connection', () => {
  it.skipIf(!enabled)(
    'intakes and commits six real counterlegs, preserves reservations and recovers FINAL after quote revocation',
    async () => {
      await mkdir(evidence, { recursive: true });
      const fixture = await createPostwarDayOneFxNativeFixture({
        repositoryRoot: root,
        evidenceDirectory: evidence,
        environment: 'ci',
      });
      let connection: PostwarTreasuryFxRuntimeConnection | undefined;
      const { marker, clone } = fixture;
      const summary: Record<string, unknown> = {
        status: 'IN_PROGRESS',
        classification: 'TEST_ONLY_ISOLATED_CFC_NATIVE_NOT_PRODUCTION',
        seedFingerprint: marker.seedFingerprint,
      };
      const databaseErrors: unknown[] = [];
      function recordDatabaseError(error: unknown, statement: string): void {
        const causes: unknown[] = [];
        let current: unknown = error;
        while (current instanceof Error && causes.length < 8) {
          causes.push({
            name: current.name,
            message: current.message,
            code: (current as Error & { code?: unknown }).code,
            stack: current.stack,
          });
          current = current.cause;
        }
        databaseErrors.push({ statement, causes });
      }
      function observe(executor: SqlExecutor): SqlExecutor {
        return {
          async query<Row extends object>(
            statement: string,
            parameters?: readonly unknown[],
          ) {
            try {
              return await executor.query<Row>(statement, parameters);
            } catch (error) {
              recordDatabaseError(error, statement);
              throw error;
            }
          },
        };
      }
      const observedDatabase: SqlDatabase = {
        query: observe(fixture.database).query,
        async transaction<T>(
          consume: (tx: SqlExecutor) => Promise<T>,
        ): Promise<T> {
          try {
            return await fixture.database.transaction((tx) =>
              consume(observe(tx)),
            );
          } catch (error) {
            recordDatabaseError(error, 'TEST_ONLY_ACTUAL_TRANSACTION_CAUSE');
            throw error;
          }
        },
      };
      const administrator = new PostgresSqlDatabase(clone.installer);
      const publisher: SqlDatabase = {
        query: administrator.query.bind(administrator),
        transaction: (fn) =>
          administrator.transaction(async (tx) => {
            await tx.query(
              'set local role world_v2_day_one_fx_source_publisher',
            );
            return fn(tx);
          }),
      };
      try {
        const decimalProposal = await readFile(
          path.join(
            root,
            'database/proposals/financial-posting-decimal-validation.sql',
          ),
          'utf8',
        );
        await clone.installer.query(decimalProposal);
        summary.decimalValidatorProposalSHA256 = sha(decimalProposal);
        let seed: C.OpeningSeed | undefined = C.parseOpeningSeed(
          JSON.parse(await readFile(fixture.artifacts.seedFile, 'utf8')),
          sha,
        );
        const [policyBytes, userReceiptBytes] = await Promise.all([
          readFile(
            path.join(root, 'config/postwar-genesis/day-one-fx.v1.json'),
            'utf8',
          ),
          readFile(
            path.join(
              root,
              'docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
            ),
            'utf8',
          ),
        ]);
        summary.stage = 'PUBLISHING_ACTUAL_70_QUOTES';
        const publication = await publishPostwarDayOneFxOriginals({
          database: publisher,
          seed,
          policyBytes,
          userReceiptBytes,
        });
        expect(publication.quotes).toHaveLength(70);
        const clock = Object.freeze({
          nowReal: () => new Date().toISOString(),
          simTime: async () => '1',
        });
        connection = createPostwarTreasuryFxRuntimeConnection({
          worldId: marker.worldId,
          workerId: fixture.workerId,
          workerRole: fixture.workerRole,
          workerDatabase: observedDatabase,
          intakePool: fixture.intakePool,
          clock,
          environment: 'ci',
        });
        const treasuryAccounts = seed.financialBatches
          .flatMap((b) => b.legs)
          .filter(
            (l) =>
              l.account.ownerId ===
                publication.quotes.find(
                  (q) => q.countryId === marker.countryId,
                )!.governmentEntityId &&
              l.account.accountClass === 'ASSET' &&
              l.account.counterpartyEntityId ===
                publication.quotes.find(
                  (q) => q.countryId === marker.countryId,
                )!.centralBankEntityId,
          )
          .map((l) => l.account.accountId);
        expect(treasuryAccounts).toHaveLength(1);
        const treasuryAccountId = treasuryAccounts[0]!;
        summary.stage = 'PREPARING_VERIFIED_SMALL_SOURCE';
        await connection.prepare({ seed, policyBytes, userReceiptBytes });
        summary.stage = 'INTAKING_FIRST_COMMAND';
        seed = undefined;
        const ports = readPostwarTreasuryFxRuntimeBinding(connection);
        const source = ports.readers.treasuryFx;
        const quote = connection
          .quotes()
          .find((q) => q.countryId === marker.countryId)!;
        const makeRequest = (
          suffix: string,
          version: string,
        ): ManualOfficeCommandRequestDto => ({
          worldId: marker.worldId,
          countryId: marker.countryId,
          officeId: 'FINANCE',
          commandType: 'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
          commandId: 'COMMAND_NATIVE_TREASURY_FX_' + suffix,
          idempotencyKey: 'KEY_NATIVE_TREASURY_FX_' + suffix,
          expectedWorldVersion: version,
          payload: {
            schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
            quoteRef: quote.quoteRef,
            payerTreasuryAccountId: treasuryAccountId,
            payerGcuAccountId: connection!.treasuryGcuAccountId(
              marker.countryId,
            ),
            dealerGcuAccountId: quote.dealerGcuAccountId,
            localAmount: '100',
            localCurrency: quote.localCurrency,
            expectedQuoteSha256: quote.quoteSha256,
          },
        });
        async function binding(): Promise<FinancialIntakeBindingDto> {
          const r = await clone.installer.query(
            `select s.seat_ref,a.authorization_version,h.world_version::text,h.event_sequence::text,ad.model_version,e.scope_key from world_v2.runtime_read_seat s join world_v2.current_commit_authorization a using(world_id,auth_subject,country_id,office_id)join world_v2.world_head h using(world_id)join world_v2.runtime_opening_admission ad using(world_id)join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE' and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex')) where s.world_id=$1 and s.auth_subject=$2::uuid and a.capability='FINANCE_TREASURY'and a.active`,
            [marker.worldId, marker.subject],
          );
          expect(r.rows).toHaveLength(1);
          const seat = r.rows[0]!;
          return {
            source: 'SERVER_VERIFIED_READ_BINDING',
            capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
            seatRef: seat.seat_ref,
            seatState: 'ACTIVE',
            identity: {
              authSubjectId: marker.subject,
              worldId: marker.worldId,
              countryId: marker.countryId,
              officeId: 'FINANCE',
              scopeKey: seat.scope_key,
              classification: 'OFFICE_PRIVATE',
              authorizationRevision: seat.authorization_version,
              modelVersion: seat.model_version,
              projectionVersion: 'postwar-office-runtime-read-v1',
            },
            seed: {
              worldId: marker.worldId,
              seedRef: marker.seedId,
              contentHash: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
            },
            readback: {
              worldId: marker.worldId,
              seedRef: marker.seedId,
              contentHash: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
              worldVersion: seat.world_version,
              eventSequence: seat.event_sequence,
              readbackRef: marker.admissionRef,
            },
          };
        }
        const intake = new PostgresOfficeCommandIntake({
          pool: ports.intakePool,
          role: fixture.intakeRole,
          runtime: ports.runtime,
          clock: ports.clock,
        });
        const submit = (request: ManualOfficeCommandRequestDto) =>
          binding().then((bound) =>
            intake.submit({
              request,
              binding: bound,
              principal: fixture.principal,
              actor: 'ACTOR_NATIVE_TREASURY_FX',
              signal: new AbortController().signal,
            }),
          );
        const request = makeRequest('COMMIT', '0');
        expect((await submit(request)).status).toBe('QUEUED');
        connection.startPreparation();
        summary.stage = 'CONSUMING_FIRST_COMMAND';
        const committed = await connection.consumeOnce();
        summary.databaseErrors = databaseErrors;
        summary.firstConsumption =
          committed.status === 'PROCESSED'
            ? {
                status: committed.status,
                source: committed.source,
                outcome: committed.receipt.outcome,
              }
            : committed;
        expect(committed.status).toBe('PROCESSED');
        if (committed.status !== 'PROCESSED')
          throw Error(JSON.stringify(committed));
        expect(committed.receipt.outcome).toBe('COMMITTED');
        const rows = await clone.installer.query(
          'select canonical_payload,batch_fingerprint from world_v2.financial_posting_batch where world_id=$1 order by batch_id',
          [marker.worldId],
        );
        expect(rows.rows).toHaveLength(2);
        const batches = rows.rows.map(
          (r) =>
            JSON.parse(r.canonical_payload) as {
              settlementCurrency: string;
              legs: {
                account: C.FinancialAccount;
                direction: string;
                amount: { amount: string; currency: string };
              }[];
            },
        );
        expect(batches.map((b) => b.legs.length).sort()).toEqual([2, 4]);
        expect(
          batches
            .flatMap((b) => b.legs)
            .some(
              (l) =>
                l.account.ownerId === quote.centralBankEntityId &&
                l.account.currency === 'GCU',
            ),
        ).toBe(false);
        for (const batch of batches) {
          const total = batch.legs.reduce(
            (n, l) =>
              l.direction === 'DEBIT'
                ? n.add(C.Money.from(l.amount.amount, l.amount.currency))
                : n.subtract(C.Money.from(l.amount.amount, l.amount.currency)),
            C.Money.from('0', batch.settlementCurrency),
          );
          expect(total.amount.isZero()).toBe(true);
        }
        const counts = async () => {
          const r = await clone.installer.query(
            `select (select count(*)::text from world_v2.authoritative_event where world_id=$1)events,(select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,(select count(*)::text from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED')receipts,(select world_version::text from world_v2.world_head where world_id=$1)version`,
            [marker.worldId],
          );
          return r.rows[0];
        };
        expect(await counts()).toEqual({
          events: '1',
          batches: '2',
          receipts: '1',
          version: '1',
        });
        expect((await submit(request)).status).toBe('QUEUED');
        expect(await connection.consumeOnce()).toEqual({ status: 'IDLE' });
        const next = makeRequest('CUTOFF', '1');
        expect((await submit(next)).status).toBe('QUEUED');
        await clone.installer.query(
          `update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$3,claimed_at_real=clock_timestamp(),claim_fencing_token=(select fencing_token from world_v2.world_writer_lease where world_id=$1)where world_id=$1 and command_id=$2 and queue_state='PENDING'`,
          [marker.worldId, next.commandId, fixture.workerId],
        );
        const durable = new DurableV08LedgerLineageReader({
          database: ports.workerDatabase,
          sha256Hex: sha,
        });
        const nextCommand = await ports.workerDatabase.transaction((tx) =>
          durable.readCommandFrom(tx, marker.worldId, next.commandId),
        );
        const before = await counts();
        let mode: 'TAMPER' | 'REVOKE' = 'TAMPER';
        const execution = createAuthoritativeWorkerExecution({
          database: ports.workerDatabase,
          workerId: fixture.workerId,
          sha256Hex: sha,
          dayOneFxSourceCommitProtectionPort: source.sourceCommitProtectionPort,
          candidateFactory: {
            async prepare(input) {
              const draft = await source.candidateFactory.prepare(input);
              if (mode === 'REVOKE') {
                await publisher.transaction((tx) =>
                  tx.query(
                    'select world_v2.revoke_postwar_day_one_fx_quote($1,$2,$3,$4)',
                    [
                      marker.worldId,
                      marker.countryId,
                      quote.quoteRef,
                      'TEST_ONLY_PREPARE_COMMIT_REVOKE',
                    ],
                  ),
                );
                return draft;
              }
              const original = draft.financialPostingBatches.find(
                (b) => b.settlementCurrency === quote.localCurrency,
              )!;
              const changed = C.createFinancialPostingBatch(
                {
                  ...original,
                  legs: original.legs.map((l) => ({
                    ...l,
                    amount: l.amount.add(
                      C.Money.from('0.000001', l.amount.currency),
                    ),
                  })),
                  command: input.command,
                  transition: draft.transition,
                },
                sha,
              );
              return {
                ...draft,
                financialPostingBatches: draft.financialPostingBatches.map(
                  (b) => (b === original ? changed : b),
                ),
              };
            },
          },
        });
        const execute = () =>
          execution.executeQueuedCommand({
            command: nextCommand,
            authorityKind: 'DISCRETIONARY_USER',
            commitSimTime: nextCommand.simTime,
            recordedAtReal: clock.nowReal(),
            requiredCapability: 'FINANCE_TREASURY',
            intakeAuthorization: fixture.authorization,
          });
        summary.stage =
          mode === 'TAMPER'
            ? 'ACTUAL_BATCH_TAMPER_CUTOFF'
            : 'QUOTE_REVOKE_CUTOFF';
        await expect(execute()).rejects.toThrow();
        expect(await counts()).toEqual(before);
        mode = 'REVOKE';
        summary.stage =
          mode === 'TAMPER'
            ? 'ACTUAL_BATCH_TAMPER_CUTOFF'
            : 'QUOTE_REVOKE_CUTOFF';
        await expect(execute()).rejects.toThrow();
        expect(await counts()).toEqual(before);
        const oldCommand = await ports.workerDatabase.transaction((tx) =>
          durable.readCommandFrom(tx, marker.worldId, request.commandId),
        );
        const recovery = createAuthoritativeWorkerExecution({
          database: ports.workerDatabase,
          workerId: fixture.workerId,
          sha256Hex: sha,
          candidateFactory: source.candidateFactory,
          dayOneFxSourceCommitProtectionPort: source.sourceCommitProtectionPort,
        });
        const final = await recovery.executeQueuedCommand({
          command: oldCommand,
          authorityKind: 'DISCRETIONARY_USER',
          commitSimTime: oldCommand.simTime,
          recordedAtReal: clock.nowReal(),
          requiredCapability: 'FINANCE_TREASURY',
          intakeAuthorization: fixture.authorization,
        });
        expect(final.source).toBe('EXISTING_FINAL');
        expect(final.receipt.outcome).toBe('COMMITTED');
        expect(await counts()).toEqual(before);
        await expect(
          source.preflightCanonical(nextCommand, clock.nowReal()),
        ).rejects.toThrow();
        summary.status = 'ACTUAL_CFC_TREASURY_FX_SIX_LEG_NATIVE_PASSED';
        summary.counts = before;
        summary.quoteRef = quote.quoteRef;
        summary.quoteSha256 = quote.quoteSha256;
        summary.counterLegs = batches;
        summary.tamperedActualBalancedBatchRejected = true;
        summary.quoteRevokedAfterPreparationRejected = true;
        summary.exactFinalRecoveredAfterRevocation = true;
        summary.production = false;
      } catch (error) {
        summary.status = 'FAILED';
        summary.error = String(error);
        summary.databaseErrors = databaseErrors;
        summary.failureCounts = (
          await clone.installer.query(
            'select (select count(*)::text from world_v2.command_submission where world_id=$1)commands,(select count(*)::text from world_v2.authoritative_event where world_id=$1)events,(select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,(select world_version::text from world_v2.world_head where world_id=$1)version',
            [marker.worldId],
          )
        ).rows[0];
        const chain: unknown[] = [];
        let cause: unknown = error;
        while (cause instanceof Error && chain.length < 8) {
          chain.push({
            name: cause.name,
            message: cause.message,
            code: (cause as Error & { code?: unknown }).code,
            stack: cause.stack,
          });
          cause = cause.cause;
        }
        summary.errorChain = chain;
        throw error;
      } finally {
        await writeFile(
          path.join(evidence, 'summary.json'),
          JSON.stringify(summary, null, 2) + '\n',
        );
        if (connection) await connection.stop();
        await fixture.cleanup();
      }
    },
    360000,
  );
});
