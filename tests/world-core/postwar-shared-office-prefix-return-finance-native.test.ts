/** Incremental acceptance from the already sealed real H5 mixed checkpoint.
 * No source bootstrap/republication, fixture balances, World/Clock or grants. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  sealPostwarReferenceClone,
} from '../support/postwar-native-reference-db.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  createPostgresFinanceBudgetNativeRuntime,
  createFinanceBudgetAuthorizationDatabase,
} from '../../apps/world-worker/src/persistence/postgres-finance-budget-custody.js';
import { authorizeManualOfficeCommand } from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
const checkpointPath = process.env.ECONMIND_POSTWAR_MIXED_H5_CHECKPOINT;
const native = checkpointPath ? describe : describe.skip;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
native(
  'actual mixed H5 Social → Finance return, independent incremental clone',
  () => {
    it('protects the exact actual Social reservation in Budget, commits a complete 3-event LINE and recovers Final', async () => {
      const checkpoint = JSON.parse(
        await readFile(checkpointPath!, 'utf8'),
      ) as {
        classification: string;
        referenceMarker: string;
        database: string;
        worldId: string;
        seedFingerprint: string;
        admissionRef: string;
        workerId: string;
        financeRole: string;
        templateSealed: boolean;
        budget: { cap: string; currency: string; treasuryAccount: string };
        policy: { envelopeRef: string; effectivePeriodRef: string };
      };
      expect(checkpoint.classification).toBe(
        'TEST_ONLY_ACTUAL_MIXED_H5_CHECKPOINT_NOT_AUTHORITY',
      );
      expect(checkpoint.templateSealed).toBe(true);
      const marker = await loadPostwarNativeReferenceMarker(
        checkpoint.referenceMarker,
      );
      expect([
        checkpoint.worldId,
        checkpoint.seedFingerprint,
        checkpoint.admissionRef,
      ]).toEqual([marker.worldId, marker.seedFingerprint, marker.admissionRef]);
      const clone = await clonePostwarNativeReference(
        marker,
        'mixed_return_finance',
        checkpoint.database,
      );
      const pool = new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user: checkpoint.financeRole,
        // Core reauthorization uses the fixed SQL resolver while a source
        // transaction holds its connection. Match the existing native protocol.
        max: 2,
        connectionTimeoutMillis: 10000,
        options: '-c request.jwt.claim.sub=' + marker.subject,
      });
      pool.on('error', () => undefined);
      const dir =
        process.env.ECONMIND_POSTWAR_MIXED_RETURN_EVIDENCE ??
        '/workspace/office-connection-evidence/postwar-shared-prefix-return-finance-native-20261028';
      const nonce = randomUUID().replaceAll('-', '').slice(0, 10),
        phases: { name: string; at: string }[] = [];
      const evidence: Record<string, unknown> = {
        classification:
          'TEST_ONLY_ACTUAL_C427_MIXED_RETURN_FINANCE_NOT_PRODUCTION',
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        inputCheckpoint: checkpointPath,
        phases,
        WorldClock: false,
        sourceRegenerated: false,
      };
      const phase = (name: string) => {
        phases.push({ name, at: new Date().toISOString() });
        console.info('MIXED_RETURN_FINANCE:' + name);
      };
      try {
        expect(
          (
            await clone.installer.query(
              'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
              [marker.worldId],
            )
          ).rows,
        ).toEqual([{ world_version: '5', event_sequence: '7' }]);
        phase('VERIFY_REAL_SOCIAL_RESERVATION_AND_ORIGINAL_ENCUMBRANCES');
        const rows = await clone.installer.query<{ canonical_payload: string }>(
          "select canonical_payload from world_v2.authoritative_event where world_id=$1 and event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'",
          [marker.worldId],
        );
        expect(rows.rows).toHaveLength(1);
        const social = JSON.parse(rows.rows[0]!.canonical_payload)
          .reservation as {
          reservationId: string;
          accountId: string;
          countryId: string;
          employerId: string;
          amount: string;
          currency: string;
        };
        expect(social.accountId).toBe(checkpoint.budget.treasuryAccount);
        expect(social.countryId).toBe(marker.countryId);
        expect(social.currency).toBe(checkpoint.budget.currency);
        expect(
          C.Money.from(social.amount, social.currency).amount.greaterThan('0'),
        ).toBe(true);
        const opening = await clone.installer.query<{
          reference: string;
          accountId: string;
          amount: string;
          currency: string;
        }>(
          `with op as(select(x->>'canonicalPayload')::jsonb body from world_v2.opening_seed s cross join lateral jsonb_array_elements(s.canonical_payload::jsonb->'sources')x where s.world_id=$1 and (x->>'canonicalPayload')::jsonb->>'schemaVersion'='postwar-operating-genesis-seed-source-v1')select f->>'fundingId'reference,f->>'accountId'"accountId",f->>'ceilingAmount'amount,f->>'currency'currency from op cross join lateral jsonb_array_elements(body->'carrier'->'facts'->'funding')f where f->>'countryId'=$2 and f->>'accountId'=$3 and f->>'payerEntityId'=$4`,
          [
            marker.worldId,
            marker.countryId,
            social.accountId,
            social.employerId,
          ],
        );
        const encumbrances = [
          ...opening.rows,
          {
            reference: social.reservationId,
            accountId: social.accountId,
            amount: social.amount,
            currency: social.currency,
          },
        ].sort((a, b) =>
          a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0,
        );
        expect(new Set(encumbrances.map((r) => r.reference)).size).toBe(
          encumbrances.length,
        );
        const expectedHash = C.canonicalSha256(
          C.canonicalHashInput(encumbrances),
          sha,
        );
        const policy = JSON.parse(
          (
            await clone.installer.query<{ policy_text: string }>(
              'select policy_text from world_v2.finance_budget_policy_original where world_id=$1 and country_id=$2 and envelope_ref=$3',
              [marker.worldId, marker.countryId, checkpoint.policy.envelopeRef],
            )
          ).rows[0]!.policy_text,
        ) as {
          governmentEntityId: string;
          currency: string;
          envelopeRef: string;
          effectivePeriodRef: string;
        };
        const at = new Date().toISOString();
        const command = C.parseCanonicalCommand(
          {
            schemaVersion: 'command-v1',
            commandId: 'COMMAND_MIXED_RETURN_FINANCE_LINE',
            commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
            actorId: 'ACTOR_SOCIAL_POSITION_NATIVE',
            authSubject: marker.subject,
            correlationId: 'CORRELATION_MIXED_RETURN_FINANCE',
            worldId: marker.worldId,
            countryId: marker.countryId,
            officeId: 'FINANCE',
            expectedWorldVersion: '5',
            idempotencyKey: 'KEY_MIXED_RETURN_FINANCE_LINE',
            simTime: '3000',
            submittedAtReal: at,
            payload: {
              operation: 'APPROVE_NEW_LINE',
              scope: {
                worldId: marker.worldId,
                countryId: marker.countryId,
                entityRef: policy.governmentEntityId,
                envelopeRef: policy.envelopeRef,
                effectivePeriodRef: policy.effectivePeriodRef,
              },
              currency: policy.currency,
              amount: C.canonicalDecimal(
                C.Money.from(
                  checkpoint.budget.cap,
                  policy.currency,
                ).amount.dividedBy('2'),
              ),
              envelopeRevisionRef: 'ENVELOPE_REV_MIXED_NATIVE',
              lineRef: 'LINE_MIXED_RETURN_FINANCE',
              revisionRef: 'LINE_REV_MIXED_RETURN_FINANCE',
              predecessorRevisionRef: null,
            },
          },
          sha,
        );
        await clone.installer.query(
          'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
          [
            command.worldId,
            command.commandId,
            command.idempotencyKey,
            command.commandType,
            command.schemaVersion,
            command.canonicalPayload,
            command.payloadHash,
            command.fingerprint,
            command.authSubject,
            command.actorId,
            command.countryId,
            command.officeId,
            command.expectedWorldVersion,
            command.simTime.toCanonicalValue(),
            command.correlationId,
            command.submittedAtReal,
          ],
        );
        await clone.installer.query(
          "insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values($1,$2,'DISCRETIONARY_USER',$3)",
          [
            command.worldId,
            command.commandId,
            command.simTime.toCanonicalValue(),
          ],
        );
        await clone.installer.query(
          "update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2",
          [marker.worldId, command.commandId, checkpoint.workerId, at],
        );
        const database = createFinanceBudgetAuthorizationDatabase(
          new PostgresSqlDatabase(pool),
        );
        const runtime = createPostgresFinanceBudgetNativeRuntime({
          database,
          workerId: checkpoint.workerId,
          sha256Hex: sha,
        });
        const execution = createAuthoritativeWorkerExecution({
          database,
          workerId: checkpoint.workerId,
          sha256Hex: sha,
          candidateFactory: runtime.factory,
          financeBudgetSourceCommitProtectionPort: runtime.commitGuard,
        });
        const authorization = await authorizeManualOfficeCommand({
          database,
          command,
        });
        const input = {
          command,
          authorityKind: 'DISCRETIONARY_USER' as const,
          requiredCapability: 'FINANCE_BUDGET' as const,
          intakeAuthorization: authorization,
          commitSimTime: command.simTime,
          recordedAtReal: at,
        };
        phase('ACTUAL_DEFAULT_FINANCE_SOURCE_REPLAYS_WHOLE_MIXED_PREFIX');
        const final = await execution.executeQueuedCommand(input);
        expect(final.receipt.outcome).toBe('COMMITTED');
        expect(final.source).toBe('NEW_FINAL');
        expect(final.receipt.worldVersionAfter).toBe('6');
        expect(final.receipt.eventIds).toHaveLength(3);
        expect((await execution.executeQueuedCommand(input)).source).toBe(
          'EXISTING_FINAL',
        );
        const stored = await clone.installer.query<{
          canonical_payload: string;
        }>(
          'select canonical_payload from world_v2.authoritative_event where world_id=$1 and causation_command_id=$2 order by event_sequence',
          [marker.worldId, command.commandId],
        );
        expect(stored.rows).toHaveLength(3);
        for (const e of stored.rows)
          expect(
            JSON.parse(e.canonical_payload).binding.openingEncumbranceHash,
          ).toBe(expectedHash);
        const footprint = (
          await clone.installer.query(
            `select(select count(*)::int from world_v2.authoritative_event where world_id=$1)events,(select count(*)::int from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED')receipts,(select count(*)::int from world_v2.command_queue where world_id=$1 and queue_state='FINALIZED')finalized,(select world_version::text from world_v2.world_head where world_id=$1)version,(select event_sequence::text from world_v2.world_head where world_id=$1)sequence,(select count(*)::int from world_v2.financial_posting_batch where world_id=$1)financial_postings`,
            [marker.worldId],
          )
        ).rows[0];
        expect(footprint).toEqual({
          events: 10,
          receipts: 6,
          finalized: 6,
          version: '6',
          sequence: '10',
          financial_postings: 0,
        });
        evidence.socialReservation = social;
        evidence.protectedEncumbranceHash = expectedHash;
        evidence.final = footprint;
        evidence.status =
          'ACTUAL_NATIVE_MIXED_RETURN_FINANCE_PASSED_NOT_PRODUCTION';
      } catch (error) {
        evidence.status = 'FAILED';
        const causes: string[] = [];
        let current: unknown = error;
        for (let i = 0; i < 8 && current instanceof Error; i++) {
          causes.push(current.message);
          current = current.cause;
        }
        evidence.failureCauses = causes;
        throw error;
      } finally {
        const head = (
          await clone.installer.query(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
            [marker.worldId],
          )
        ).rows[0];
        evidence.head = head;
        await pool.end();
        await clone.close();
        await sealPostwarReferenceClone(marker, clone.database);
        await mkdir(dir, { recursive: true });
        const bytes = JSON.stringify(evidence, null, 2) + '\n';
        await writeFile(path.join(dir, `attempt-${nonce}.json`), bytes);
        await writeFile(path.join(dir, 'summary.json'), bytes);
        await writeFile(
          path.join(dir, `checkpoint-${nonce}.json`),
          JSON.stringify(
            {
              ...checkpoint,
              database: clone.database,
              head,
              status: evidence.status,
              templateSealed: true,
            },
            null,
            2,
          ) + '\n',
        );
      }
    }, 600000);
  },
);
