/** Opt-in one-World, one-consumer actual cfc chain. This never bootstraps a
 * second World, invents a quote/mandate, posts payroll, or starts WorldClock. */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pid as parentPid } from 'node:process';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import type { ManualOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import type { FinancialIntakeBindingDto } from '@econmind/core/authenticated-financial-intake-contract';
import {
  PostgresOfficeCommandIntake,
  manualOfficeCommandCapability,
  buildManualOfficeCommandIntent,
} from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import { createManualOfficeCommandComposition } from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { createHash } from 'node:crypto';
import { readPostwarFinanceSocialRuntimeBinding } from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import { createPostwarFinanceSocialFxNativeFixture } from '../support/postwar-finance-social-fx-native-fixture.js';
import { startPostwarMixedColdRestarts } from '../support/postwar-mixed-cold-restart.js';
const enabled = process.env.ECONMIND_POSTWAR_MIXED_FX_NATIVE === '1';
const evidence =
  '/workspace/.cloud-setup/evidence/fx-cfc-mixed-native-20261029';
describe('actual Finance FX Social complete prefix with one fixed durable consumer', () => {
  it.skipIf(!enabled)(
    'commits Budget → FX → POSITION → PLAN → LINE → FX → MATCH and rereads both current sources',
    async () => {
      await mkdir(evidence, { recursive: true });
      const fixture = await createPostwarFinanceSocialFxNativeFixture({
        evidenceDirectory: evidence,
      });
      const connection = fixture.connection,
        ports = readPostwarFinanceSocialRuntimeBinding(connection);
      const { marker, clone } = fixture,
        nonce = randomBytes(6).toString('hex').toUpperCase();
      const summary: Record<string, unknown> = {
        status: 'IN_PROGRESS',
        classification: 'ACTUAL_TEST_ONLY_CFC_MIXED_NOT_PRODUCTION',
        seedFingerprint: marker.seedFingerprint,
        worldId: marker.worldId,
        oneConsumer: true,
        sourcePreparedBeforeRequests: true,
      };
      const steps: unknown[] = [];
      const progress = async (stage: string) => {
        summary.stage = stage;
        await writeFile(
          path.join(evidence, 'progress.json'),
          JSON.stringify({ ...summary, steps }, null, 2) + '\n',
        );
      };
      let lastRequest: ManualOfficeCommandRequestDto | null = null;
      let finalHost:
        | Awaited<ReturnType<typeof startPostwarMixedColdRestarts>>['finalHost']
        | undefined;
      try {
        fixture.setSimTime('0');
        const policy = fixture.c01Policy,
          loc = fixture.locators.COUNTRY_01!;
        const common = (
          name: string,
          office: 'FINANCE' | 'SOCIAL',
          type: ManualOfficeCommandRequestDto['commandType'],
          version: string,
          payload: unknown,
        ): ManualOfficeCommandRequestDto => ({
          worldId: marker.worldId,
          countryId: marker.countryId,
          officeId: office,
          commandType: type,
          commandId: 'COMMAND_MIXED_FX_' + name + '_' + nonce,
          idempotencyKey: 'KEY_MIXED_FX_' + name + '_' + nonce,
          expectedWorldVersion: version,
          payload,
        });
        const budget = (
          name: string,
          version: string,
          operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
        ) =>
          common(
            name,
            'FINANCE',
            'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
            version,
            {
              operation,
              scope: {
                worldId: marker.worldId,
                countryId: marker.countryId,
                entityRef: policy.governmentEntityId,
                envelopeRef: policy.envelopeRef,
                effectivePeriodRef: policy.effectivePeriodRef,
              },
              currency: policy.currency,
              amount: operation === 'SET_ENVELOPE' ? '1000' : '100',
              envelopeRevisionRef: 'ENVELOPE_MIXED_FX_' + nonce,
              lineRef:
                operation === 'SET_ENVELOPE'
                  ? null
                  : 'LINE_MIXED_FX_' + name + '_' + nonce,
              revisionRef:
                operation === 'SET_ENVELOPE'
                  ? 'ENVELOPE_MIXED_FX_' + nonce
                  : 'LINE_REV_MIXED_FX_' + name + '_' + nonce,
              predecessorRevisionRef: null,
            },
          );
        const fx = (name: string, version: string, amount = '100') =>
          common(
            name,
            'FINANCE',
            'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
            version,
            {
              schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
              quoteRef: fixture.fxQuote.quoteRef,
              payerTreasuryAccountId: fixture.fxTreasuryAccountId,
              payerGcuAccountId: fixture.fxGovernmentGcuAccountId,
              dealerGcuAccountId: fixture.fxQuote.dealerGcuAccountId,
              localAmount: amount,
              localCurrency: fixture.fxQuote.localCurrency,
              expectedQuoteSha256: fixture.fxQuote.quoteSha256,
            },
          );
        const position = common(
          'POSITION',
          'SOCIAL',
          C.SOCIAL_POSITION_OFFER_CREATE_COMMAND,
          '2',
          {
            schemaVersion: 'social-employment-position-offer-create-v1',
            positionId: 'POSITION_MIXED_FX_' + nonce,
            locationId: loc.wage.locationId,
            skill: loc.wage.skill,
            publicService: loc.wage.classificationId,
            occupation: loc.wage.occupation,
            requiredCount: '1',
            wageScheduleRef: loc.wage.positionId,
            fundingAccountId: loc.funding.accountRef,
            coverageDays: '1',
          },
        );
        const plan = common(
          'PLAN',
          'SOCIAL',
          C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
          '3',
          {
            schemaVersion: 'social-employment-service-plan-v1',
            locationId: loc.wage.locationId,
            skill: loc.wage.skill,
            positionId: 'POSITION_MIXED_FX_' + nonce,
            servicePoolId: loc.servicePoolId,
            requestedMatches: '1',
            dueDayIndex: '0',
          },
        );
        async function binding(
          request: ManualOfficeCommandRequestDto,
        ): Promise<FinancialIntakeBindingDto> {
          const r = await clone.installer.query(
            `select s.seat_ref,a.authorization_version,h.world_version::text,h.event_sequence::text,ad.model_version,e.scope_key from world_v2.runtime_read_seat s join world_v2.current_commit_authorization a using(world_id,auth_subject,country_id,office_id)join world_v2.world_head h using(world_id)join world_v2.runtime_opening_admission ad using(world_id)join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex'))where s.world_id=$1 and s.auth_subject=$2::uuid and s.country_id=$3 and s.office_id=$4 and a.capability=$5 and a.active`,
            [
              marker.worldId,
              marker.subject,
              marker.countryId,
              request.officeId,
              manualOfficeCommandCapability(request),
            ],
          );
          expect(r.rows).toHaveLength(1);
          const s = r.rows[0]!;
          return {
            source: 'SERVER_VERIFIED_READ_BINDING',
            capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
            seatRef: s.seat_ref,
            seatState: 'ACTIVE',
            identity: {
              authSubjectId: marker.subject,
              worldId: marker.worldId,
              countryId: marker.countryId,
              officeId: request.officeId,
              scopeKey: s.scope_key,
              classification: 'OFFICE_PRIVATE',
              authorizationRevision: s.authorization_version,
              modelVersion: s.model_version,
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
              worldVersion: s.world_version,
              eventSequence: s.event_sequence,
              readbackRef: marker.admissionRef,
            },
          };
        }
        const intake = new PostgresOfficeCommandIntake({
          pool: ports.intakePool,
          runtime: ports.runtime,
          role: fixture.intakeRole,
          clock: ports.clock,
        });
        const submit = async (request: ManualOfficeCommandRequestDto) =>
          intake.submit({
            request,
            binding: await binding(request),
            principal: fixture.principal,
            actor: 'ACTOR_TEST_ONLY_MIXED_FX',
            signal: new AbortController().signal,
          });
        const counts = async () => {
          const r = await clone.installer.query(
            `select (select count(*)::text from world_v2.command_submission where world_id=$1)commands,(select count(*)::text from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED')receipts,(select count(*)::text from world_v2.authoritative_event where world_id=$1)events,(select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,(select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory,(select count(*)::text from world_v2.command_queue where world_id=$1 and queue_state='FINALIZED')finalized,(select world_version::text from world_v2.world_head where world_id=$1)version,(select event_sequence::text from world_v2.world_head where world_id=$1)sequence`,
            [marker.worldId],
          );
          return r.rows[0]!;
        };
        connection.startPreparation();
        async function process(
          request: ManualOfficeCommandRequestDto,
          expectedVersion: string,
          expectedSequence: string,
        ) {
          lastRequest = request;
          await progress('INTAKE_' + request.commandId);
          expect((await submit(request)).status).toBe('QUEUED');
          await progress('CONSUME_' + request.commandId);
          const result = await connection.consumeOnce();
          steps.push({
            commandId: request.commandId,
            type: request.commandType,
            status: result.status,
            ...(result.status === 'PROCESSED'
              ? { source: result.source, outcome: result.receipt.outcome }
              : { result }),
          });
          expect(result.status, JSON.stringify(steps.at(-1))).toBe('PROCESSED');
          if (result.status !== 'PROCESSED')
            throw Error('MIXED_NATIVE_EXPECTED_PROCESSED');
          expect(result.source).toBe('NEW_FINAL');
          expect(result.receipt.outcome).toBe('COMMITTED');
          const c = await counts();
          expect(c.version).toBe(expectedVersion);
          expect(c.sequence).toBe(expectedSequence);
          summary.lastCommittedHead = {
            worldVersion: expectedVersion,
            eventSequence: expectedSequence,
          };
          await progress('COMMITTED_' + request.commandId);
          return c;
        }
        const envelope = budget('ENVELOPE', '0', 'SET_ENVELOPE'),
          firstFx = fx('FIRST_FX', '1'),
          line = budget('LINE', '4', 'APPROVE_NEW_LINE'),
          secondFx = fx('SECOND_FX', '5');
        await process(envelope, '1', '1');
        await process(firstFx, '2', '2');
        await process(position, '3', '3');
        await process(plan, '4', '4');
        await process(line, '5', '7');
        await process(secondFx, '6', '8');
        await progress('PUBLISH_GENUINE_DUE_MATCH');
        await fixture.publishDueMatches();
        const pending = await clone.installer.query(
          `select s.command_id,s.command_type,s.expected_world_version::text from world_v2.command_queue q join world_v2.command_submission s using(world_id,command_id)where q.world_id=$1 and q.queue_state='PENDING'`,
          [marker.worldId],
        );
        expect(pending.rows).toHaveLength(1);
        expect(pending.rows[0]!.command_type).toBe(
          C.SOCIAL_JOB_MATCH_DUE_COMMAND,
        );
        expect(pending.rows[0]!.expected_world_version).toBe('6');
        const matched = await connection.consumeOnce();
        steps.push({
          type: 'MATCH',
          status: matched.status,
          ...(matched.status === 'PROCESSED'
            ? { source: matched.source, outcome: matched.receipt.outcome }
            : { result: matched }),
        });
        expect(matched.status, JSON.stringify(steps.at(-1))).toBe('PROCESSED');
        if (matched.status !== 'PROCESSED') throw Error('GENUINE_MATCH_FAILED');
        expect(matched.receipt.outcome).toBe('COMMITTED');
        const before = await counts();
        expect(before).toEqual({
          commands: '7',
          receipts: '7',
          events: '9',
          batches: '4',
          inventory: '0',
          finalized: '7',
          version: '7',
          sequence: '9',
        });
        const originals = await clone.installer.query<{
          event_type: string;
          canonical_payload: string;
        }>(
          'select event_type,canonical_payload from world_v2.authoritative_event where world_id=$1 order by event_sequence',
          [marker.worldId],
        );
        const fxEvents = originals.rows
          .filter(
            (r) => r.event_type === 'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1',
          )
          .map(
            (r) =>
              JSON.parse(r.canonical_payload) as {
                encumbrances: {
                  treasuryReservedAmount: string;
                  bankGcuReservedAmount: string;
                };
                actualLocalDebit: string;
                filledGcu: string;
                quote: { localCurrency: string };
              },
          );
        const newPosition = JSON.parse(
          originals.rows.find(
            (r) => r.event_type === C.SOCIAL_POSITION_OFFER_CREATED_EVENT,
          )!.canonical_payload,
        ) as { reservation: { amount: string } };
        expect(fxEvents).toHaveLength(2);
        const heldBefore = C.Money.from(
            fxEvents[0]!.encumbrances.treasuryReservedAmount,
            policy.currency,
          ),
          heldAfter = C.Money.from(
            fxEvents[1]!.encumbrances.treasuryReservedAmount,
            policy.currency,
          );
        expect(heldAfter.toCanonicalValue()).toEqual(
          heldBefore
            .add(C.Money.from(newPosition.reservation.amount, policy.currency))
            .toCanonicalValue(),
        );
        expect(
          C.Money.from(
            newPosition.reservation.amount,
            policy.currency,
          ).amount.greaterThan(0),
        ).toBe(true);
        expect(
          fxEvents.every((e) => e.encumbrances.bankGcuReservedAmount === '0'),
        ).toBe(true);
        const canonical = (request: ManualOfficeCommandRequestDto) =>
          buildManualOfficeCommandIntent({
            request,
            countryId: marker.countryId,
            officeId: request.officeId,
            authSubject: marker.subject,
            actor: 'ACTOR_TEST_ONLY_MIXED_FX',
            simTime: '0',
            submittedAtReal: ports.clock.nowReal(),
            correlationId: 'CORRELATION_' + request.commandId,
          });
        await progress('COMPLETE_H7_CURRENT_SOURCE_READBACK');
        await ports.budget.assertSourceBeforeClaim({
          command: canonical(budget('PROBE_LINE', '7', 'APPROVE_NEW_LINE')),
          observedAtReal: ports.clock.nowReal(),
        });
        expect(ports.treasuryFx).not.toBeNull();
        await ports.treasuryFx!.preflightCanonical(
          canonical(fx('PROBE_FX', '7', '1')),
          ports.clock.nowReal(),
        );
        expect(await counts()).toEqual(before);
        for (const request of [
          envelope,
          firstFx,
          position,
          plan,
          line,
          secondFx,
        ])
          expect((await submit(request)).status).toBe('FINALIZED');
        expect(await connection.consumeOnce()).toEqual({ status: 'IDLE' });
        expect(await counts()).toEqual(before);
        await progress('PERSISTED_FINANCIAL_CONSERVATION');
        const batchRows = await clone.installer.query<{
          canonical_payload: string;
        }>(
          'select canonical_payload from world_v2.financial_posting_batch where world_id=$1 order by batch_id',
          [marker.worldId],
        );
        const batches = batchRows.rows.map(
          (row) =>
            JSON.parse(row.canonical_payload) as {
              settlementCurrency: string;
              legs: {
                account: C.FinancialAccount;
                direction: 'DEBIT' | 'CREDIT';
                amount: { amount: string; currency: string };
              }[];
            },
        );
        expect(batches).toHaveLength(4);
        expect(batches.map((batch) => batch.legs.length).sort()).toEqual([
          2, 2, 4, 4,
        ]);
        for (const batch of batches) {
          const net = batch.legs.reduce(
            (sum, leg) =>
              leg.direction === 'DEBIT'
                ? sum.add(C.Money.from(leg.amount.amount, leg.amount.currency))
                : sum.subtract(
                    C.Money.from(leg.amount.amount, leg.amount.currency),
                  ),
            C.Money.from('0', batch.settlementCurrency),
          );
          expect(net.amount.isZero()).toBe(true);
          expect(
            batch.legs.every(
              (leg) => leg.account.currency === batch.settlementCurrency,
            ),
          ).toBe(true);
          expect(
            batch.legs.some(
              (leg) =>
                leg.account.ownerId === fixture.fxQuote.centralBankEntityId &&
                leg.account.currency === 'GCU',
            ),
          ).toBe(false);
        }
        summary.persistedBalancedBatches = batches.map((batch) => ({
          currency: batch.settlementCurrency,
          legCount: batch.legs.length,
        }));
        await progress('LOW_INTAKE_AND_CROSS_COUNTRY_DENIAL');
        await expect(
          fixture.intakePool.query(
            'select canonical_payload from world_v2.opening_seed where world_id=$1',
            [marker.worldId],
          ),
        ).rejects.toMatchObject({ code: '42501' });
        const foreignProbe = {
          ...fx('FOREIGN_COUNTRY', '7', '1'),
          countryId: 'COUNTRY_02',
        };
        const ownCountryBinding = await binding(
          fx('OWN_COUNTRY_BINDING', '7', '1'),
        );
        await expect(
          intake.submit({
            request: foreignProbe,
            binding: ownCountryBinding,
            principal: fixture.principal,
            actor: 'ACTOR_TEST_ONLY_MIXED_FX',
            signal: new AbortController().signal,
          }),
        ).rejects.toThrow();
        expect(await counts()).toEqual(before);
        summary.lowIntakeRawSeedDeniedAndCrossCountryRejected = true;
        await progress('ACTUAL_AUTHORIZATION_REVOCATION');
        const revokedProbe = fx('REVOKED_AUTH', '7', '1');
        const staleBinding = await binding(revokedProbe);
        await clone.installer.query(
          "update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='FINANCE' and capability='FINANCE_TREASURY'",
          [marker.worldId, marker.subject, marker.countryId],
        );
        try {
          await expect(
            intake.submit({
              request: revokedProbe,
              binding: staleBinding,
              principal: fixture.principal,
              actor: 'ACTOR_TEST_ONLY_MIXED_FX',
              signal: new AbortController().signal,
            }),
          ).rejects.toThrow();
          expect(await counts()).toEqual(before);
        } finally {
          await clone.installer.query(
            "update world_v2.current_commit_authorization set active=true where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='FINANCE' and capability='FINANCE_TREASURY'",
            [marker.worldId, marker.subject, marker.countryId],
          );
        }
        summary.authorizationRevocationDeniedWithoutWrites = true;
        await progress('TWO_FRESH_OS_COLD_RESTARTS');
        const restarted = await startPostwarMixedColdRestarts({
          fixture,
          requests: [envelope, firstFx, position, plan, line, secondFx],
          actor: 'ACTOR_TEST_ONLY_MIXED_FX',
          expectedHead: { worldVersion: '7', eventSequence: '9' },
        });
        finalHost = restarted.finalHost;
        expect(restarted.generations).toHaveLength(2);
        expect(restarted.generations[0]!.pid).not.toBe(
          restarted.generations[1]!.pid,
        );
        for (const generation of restarted.generations) {
          expect(generation.pid).not.toBe(parentPid);
          expect(generation.consumerState).toBe('PREPARED');
          expect(generation.consumerStarted).toBe(false);
          expect(generation.after).toEqual(generation.before);
        }
        expect(await counts()).toEqual(before);
        summary.coldRestarts = restarted.generations;
        await progress('ACTUAL_SOURCE_REVOCATION');
        const source = await clone.installer.query<{
          registration_ref: string;
        }>(
          'select registration_ref from world_v2.postwar_day_one_fx_source_original where world_id=$1',
          [marker.worldId],
        );
        expect(source.rows).toHaveLength(1);
        const publisher = await clone.installer.connect();
        try {
          await publisher.query('begin');
          await publisher.query(
            'set local role world_v2_day_one_fx_source_publisher',
          );
          await publisher.query(
            'select world_v2.revoke_postwar_day_one_fx_source($1,$2)',
            [
              source.rows[0]!.registration_ref,
              'TEST_ONLY_MIXED_POST_COMMIT_SOURCE_REVOCATION',
            ],
          );
          await publisher.query('commit');
        } catch (error) {
          await publisher.query('rollback');
          throw error;
        } finally {
          publisher.release();
        }
        const revokeReadback = await finalHost.verifyRevokedSource(
          fx('REVOKED_SOURCE', '7', '1'),
        );
        expect(revokeReadback.newFxDenied).toBe(true);
        expect(revokeReadback.finalizedCount).toBe(6);
        expect(revokeReadback.countsAfter).toEqual(revokeReadback.countsBefore);
        expect(await counts()).toEqual(before);
        summary.coldHostSourceRevocationReadback = revokeReadback;
        summary.sourceRevocationDeniedNewFxAndPreservedExactFinal = true;
        summary.status =
          'ACTUAL_CFC_BUDGET_FX_SOCIAL_BUDGET_FX_MATCH_NATIVE_PASSED';
        summary.steps = steps;
        summary.counts = before;
        summary.fxEncumbrances = fxEvents.map((e) => e.encumbrances);
        summary.socialReservation = newPosition.reservation;
        summary.lineNotDoubleCounted = true;
        summary.completeH7SourceReadback = true;
        summary.finalRetriesAddNoRows = true;
        summary.production = false;
      } catch (error) {
        summary.status = 'FAILED';
        summary.steps = steps;
        summary.error = String(error);
        summary.databaseErrors = fixture.databaseErrors;
        if (lastRequest && String(summary.stage).startsWith('CONSUME_')) {
          try {
            const sha = (value: string) =>
              createHash('sha256').update(value).digest('hex');
            const durable = new DurableV08LedgerLineageReader({
              database: ports.database,
              sha256Hex: sha,
            });
            const command = await ports.database.transaction((tx) =>
              durable.readCommandReadOnlyFrom(
                tx,
                marker.worldId,
                lastRequest!.commandId,
              ),
            );
            const composition = createManualOfficeCommandComposition({
              command,
              database: ports.database,
              workerId: fixture.workerId,
              sha256Hex: sha,
              readers: {
                ...ports.socialConnection.readers,
                financeBudget: ports.budget,
                treasuryFx: ports.treasuryFx,
              },
            });
            if (composition?.assertSourceBeforeClaim)
              await composition.assertSourceBeforeClaim(ports.clock.nowReal());
          } catch (preflightError) {
            const chain: unknown[] = [];
            let cause: unknown = preflightError;
            while (cause instanceof Error && chain.length < 8) {
              chain.push({
                name: cause.name,
                message: cause.message,
                stack: cause.stack,
              });
              cause = cause.cause;
            }
            summary.actualCommandReadonlyPreflightFailure = chain;
          }
        }
        const causes: unknown[] = [];
        let current: unknown = error;
        while (current instanceof Error && causes.length < 8) {
          causes.push({
            name: current.name,
            message: current.message,
            stack: current.stack,
            code: (current as Error & { code?: unknown }).code,
          });
          current = current.cause;
        }
        summary.causes = causes;
        throw error;
      } finally {
        try {
          try {
            await finalHost?.stop();
          } finally {
            try {
              await connection.stop();
            } finally {
              await fixture.cleanup();
            }
          }
          summary.cleanup = 'COMPLETED';
        } catch (cleanupError) {
          summary.status = 'FAILED_CLEANUP';
          summary.cleanupError = String(cleanupError);
        } finally {
          await writeFile(
            path.join(evidence, 'summary.json'),
            JSON.stringify(summary, null, 2) + '\n',
          );
        }
      }
      expect(summary.cleanup).toBe('COMPLETED');
    },
    360000,
  );
});
