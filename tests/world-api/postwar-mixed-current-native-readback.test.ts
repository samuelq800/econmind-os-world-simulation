/** Opt-in actual cfc clone: genuine mixed commands -> derived publication ->
 * low-privilege JWT API and shipped browser parser. No new World/Clock or
 * synthetic H0 rows; the offline registrar is explicitly TEST_ONLY. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import type { ManualOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import type { FinancialIntakeBindingDto } from '@econmind/core/authenticated-financial-intake-contract';
import type { ServerReadAuthority } from '../../apps/world-web/src/production-read/contract.js';
import {
  PostgresOfficeCommandIntake,
  manualOfficeCommandCapability,
} from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import {
  derivePostwarMixedFinancialCurrentFrom,
  POSTWAR_MIXED_FINANCIAL_PUBLISH_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-mixed-financial-current-publication.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { readPostwarFinanceSocialRuntimeBinding } from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import { createPostwarFinanceSocialFxNativeFixture } from '../support/postwar-finance-social-fx-native-fixture.js';
import {
  deriveCfcMixedCurrentReadData,
  installCfcMixedCurrentReadbackFrom,
} from '../support/postwar-mixed-current-native-readback.js';
const enabled = process.env.ECONMIND_POSTWAR_MIXED_CURRENT_NATIVE === '1';
const evidence =
  '/workspace/.cloud-setup/evidence/fx-cfc-mixed-current-native-20261030';
describe('actual mixed current readback (explicit independent native slot only)', () => {
  it.skipIf(!enabled)(
    'publishes actual Finance/CB/Social at the same head, rejects stale/unavailable/revoked data and preserves legal EMPTY',
    async () => {
      await mkdir(evidence, { recursive: true });
      const fixture = await createPostwarFinanceSocialFxNativeFixture({
        evidenceDirectory: evidence,
      });
      let readback:
        | Awaited<ReturnType<typeof installCfcMixedCurrentReadbackFrom>>
        | undefined;
      const describeError = (error: unknown, depth = 0): unknown =>
        error instanceof Error && depth < 8
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              ...('code' in error ? { code: error.code } : {}),
              ...('where' in error ? { where: error.where } : {}),
              ...(error.cause
                ? { cause: describeError(error.cause, depth + 1) }
                : {}),
            }
          : String(error);
      let failure: unknown;
      const fixedRoles = [
        'world_v2_postwar_projection_owner',
        'world_v2_postwar_projection_publisher',
        'world_v2_postwar_projection_reader',
      ];
      const priorFixed = (
        await fixture.clone.installer.query<{ rolname: string }>(
          'select rolname from pg_roles where rolname=any($1::text[])',
          [fixedRoles],
        )
      ).rows.map((r) => r.rolname);
      const summary: Record<string, unknown> = {
        classification: 'ACTUAL_TEST_ONLY_CFC_MIXED_CURRENT_NOT_PRODUCTION',
        status: 'IN_PROGRESS',
      };
      try {
        summary.stage = 'OFFLINE_GENUINE_CFC_DATA';
        const ports = readPostwarFinanceSocialRuntimeBinding(
            fixture.connection,
          ),
          marker = fixture.marker;
        let seed: C.OpeningSeed | undefined = C.parseOpeningSeed(
          JSON.parse(await readFile(fixture.artifacts.seedFile, 'utf8')),
          (s) => createHash('sha256').update(s).digest('hex'),
        );
        const data = deriveCfcMixedCurrentReadData({
          seed,
          admissionRef: marker.admissionRef,
          canonicalSeedSHA256: String(fixture.header.canonical_intent_sha256),
        });
        seed = undefined;
        summary.stage = 'INSTALL_FIXED_SQL_AND_REGISTER_ACTUAL_H0';
        readback = await installCfcMixedCurrentReadbackFrom(fixture, data);
        await expect(
          fixture.readPool.query(
            'select canonical_payload from world_v2.opening_seed',
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          fixture.readPool.query(
            'select * from world_v2.postwar_mixed_current_document',
          ),
        ).rejects.toMatchObject({ code: '42501' });
        const empty = await readback.read({
          officeId: 'SOCIAL',
          dataset: 'offers',
        });
        expect(empty.httpStatus).toBe(200);
        expect(empty.body.status).toBe('EMPTY');
        expect(empty.body.rows).toEqual([]);
        summary.actualEmptySource = 'ADMITTED_H0_OFFERS_NOT_POST_H0_CURRENT';
        fixture.setSimTime('0');
        const nonce = randomBytes(6).toString('hex').toUpperCase(),
          policy = fixture.c01Policy,
          loc = fixture.locators.COUNTRY_01!;
        const command = (
          name: string,
          officeId: 'FINANCE' | 'SOCIAL',
          commandType: ManualOfficeCommandRequestDto['commandType'],
          expectedWorldVersion: string,
          payload: unknown,
        ): ManualOfficeCommandRequestDto => ({
          worldId: marker.worldId,
          countryId: marker.countryId,
          officeId,
          commandType,
          expectedWorldVersion,
          commandId: 'COMMAND_CURRENT_' + name + '_' + nonce,
          idempotencyKey: 'KEY_CURRENT_' + name + '_' + nonce,
          payload,
        });
        const envelope = command(
          'BUDGET',
          'FINANCE',
          'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
          '0',
          {
            operation: 'SET_ENVELOPE',
            scope: {
              worldId: marker.worldId,
              countryId: marker.countryId,
              entityRef: policy.governmentEntityId,
              envelopeRef: policy.envelopeRef,
              effectivePeriodRef: policy.effectivePeriodRef,
            },
            currency: policy.currency,
            amount: '1000',
            envelopeRevisionRef: 'ENVELOPE_CURRENT_' + nonce,
            lineRef: null,
            revisionRef: 'ENVELOPE_CURRENT_' + nonce,
            predecessorRevisionRef: null,
          },
        );
        const fx = (name: string, head: string) =>
          command(
            name,
            'FINANCE',
            'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
            head,
            {
              schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
              quoteRef: fixture.fxQuote.quoteRef,
              payerTreasuryAccountId: fixture.fxTreasuryAccountId,
              payerGcuAccountId: fixture.fxGovernmentGcuAccountId,
              dealerGcuAccountId: fixture.fxQuote.dealerGcuAccountId,
              localAmount: '100',
              localCurrency: fixture.fxQuote.localCurrency,
              expectedQuoteSha256: fixture.fxQuote.quoteSha256,
            },
          );
        const position = command(
          'POSITION',
          'SOCIAL',
          C.SOCIAL_POSITION_OFFER_CREATE_COMMAND,
          '2',
          {
            schemaVersion: 'social-employment-position-offer-create-v1',
            positionId: 'POSITION_CURRENT_' + nonce,
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
        const intake = new PostgresOfficeCommandIntake({
          pool: ports.intakePool,
          runtime: ports.runtime,
          role: fixture.intakeRole,
          clock: ports.clock,
        });
        async function submit(request: ManualOfficeCommandRequestDto) {
          const r = await fixture.clone.installer.query(
            "select s.seat_ref,a.authorization_version,h.world_version::text,h.event_sequence::text,ad.model_version,e.scope_key from world_v2.runtime_read_seat s join world_v2.current_commit_authorization a using(world_id,auth_subject,country_id,office_id)join world_v2.world_head h using(world_id)join world_v2.runtime_opening_admission ad using(world_id)join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex'))where s.world_id=$1 and s.auth_subject=$2::uuid and s.country_id=$3 and s.office_id=$4 and a.capability=$5 and a.active",
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
          const binding: FinancialIntakeBindingDto = {
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
          expect(
            (
              await intake.submit({
                request,
                binding,
                principal: fixture.principal,
                actor: 'ACTOR_CURRENT_TEST_ONLY',
                signal: new AbortController().signal,
              })
            ).status,
          ).toBe('QUEUED');
          summary.stage = 'ACTUAL_CONSUME_' + request.commandId;
          const consumed = await fixture.connection.consumeOnce();
          expect(consumed.status).toBe('PROCESSED');
          if (consumed.status !== 'PROCESSED')
            throw Error('ACTUAL_CONSUMER_REQUIRED');
          expect(consumed.receipt.outcome).toBe('COMMITTED');
        }
        fixture.connection.startPreparation();
        for (const request of [envelope, fx('FX1', '1'), position])
          await submit(request);
        const before = await readback.read({
          officeId: 'FINANCE',
          dataset: 'treasury-capacity',
        });
        expect(before.httpStatus).toBe(503);
        expect(before.body.ok).toBe(false);
        summary.stage = 'PUBLISH_GENUINE_MIXED_CURRENT';
        const published = await readback.publish();
        expect(published.finance).toHaveLength(10);
        expect(published.social).toHaveLength(2);
        const finance = await readback.read({
            officeId: 'FINANCE',
            dataset: 'treasury-capacity',
          }),
          cb = await readback.read({
            officeId: 'CENTRAL_BANK',
            dataset: 'ledger-balances',
          }),
          social = await readback.read({
            officeId: 'SOCIAL',
            dataset: 'positions',
          });
        for (const page of [finance, cb, social]) {
          expect(page.httpStatus).toBe(200);
          expect(page.headers.get('cache-control')).toContain('no-store');
          const source = page.body.source as Record<string, unknown>;
          expect(source.worldVersion).toBe('3');
          expect(source.eventSequence).toBe('3');
        }
        const capacity = (finance.body.rows as Record<string, unknown>[])[0]!;
        expect(capacity.governmentGcuCashBalance).not.toBe('0');
        expect(capacity.budgetEnvelopeCapacity).toBe('1000');
        expect(
          C.Money.from(
            String(capacity.treasuryLedgerClaimBalance),
            policy.currency,
          ).amount.lessThan(
            C.Money.from(
              data.scopes.find((c) => c.countryId === marker.countryId)!
                .fundingAccounts[0]!.availableAmount,
              policy.currency,
            ).amount,
          ),
        ).toBe(true);
        const financialCoverage = (
          finance.body.source as Record<string, unknown>
        ).currentFinancialCoverage as Record<string, unknown>;
        expect(financialCoverage.financialPostingCount).toBe('6');
        expect(financialCoverage.financialBatchCount).toBe('2');
        const socialRows = social.body.rows as Record<string, unknown>[];
        let socialPage = social;
        while (
          (socialPage.body.page as { nextOffset: number | null }).nextOffset !==
          null
        ) {
          const p = socialPage.body.page as { nextOffset: number },
            s = socialPage.body.source as Record<string, string>;
          socialPage = await readback.read({
            officeId: 'SOCIAL',
            dataset: 'positions',
            offset: p.nextOffset,
            sourceVersion: s.sourceVersion,
            bindingVersion: s.bindingVersion,
          });
          expect(socialPage.httpStatus).toBe(200);
          socialRows.push(
            ...(socialPage.body.rows as Record<string, unknown>[]),
          );
        }
        expect(
          socialRows.some((p) => p.positionId === 'POSITION_CURRENT_' + nonce),
        ).toBe(true);
        const first = await readback.read({
          officeId: 'FINANCE',
          dataset: 'ledger-balances',
          limit: 1,
        });
        const firstSource = first.body.source as Record<string, string>,
          firstPage = first.body.page as { nextOffset: number | null };
        expect(firstPage.nextOffset).not.toBeNull();
        const second = await readback.read({
          officeId: 'FINANCE',
          dataset: 'ledger-balances',
          limit: 1,
          offset: firstPage.nextOffset!,
          sourceVersion: firstSource.sourceVersion,
          bindingVersion: firstSource.bindingVersion,
        });
        expect(second.httpStatus).toBe(200);
        await readback.source.withSnapshot(
          marker.countryId,
          async (tx, token) => {
            const derived = derivePostwarMixedFinancialCurrentFrom(tx, token),
              assertion = JSON.parse(derived.assertion) as Record<
                string,
                unknown
              >;
            assertion.currentRowsHash = 'sha256:' + '0'.repeat(64);
            await expect(
              new PostgresSqlDatabase(fixture.clone.installer).transaction(
                async (publication) => {
                  await publication.query(
                    'set local role world_v2_postwar_projection_publisher',
                  );
                  await publication.query(
                    POSTWAR_MIXED_FINANCIAL_PUBLISH_QUERY,
                    [
                      marker.worldId,
                      marker.countryId,
                      C.canonicalSerialize(assertion),
                    ],
                  );
                },
              ),
            ).rejects.toThrow();
          },
        );
        summary.failedPublicationRetry =
          'ACTUAL_WRONG_ROWS_HASH_ROLLED_BACK_THEN_SAME_HEAD_IDEMPOTENT_PUBLISH';
        const again = await readback.publish();
        expect(again.finance.map((d) => d.document_ref)).toEqual(
          published.finance.map((d) => d.document_ref),
        );
        const authority = finance.body.authority as ServerReadAuthority;
        const browser = await readback.browserPage({
          dataset: 'treasury-capacity',
          config: {
            identity: authority.identity,
            seatRef: authority.seatRef,
            world: {
              worldId: marker.worldId,
              seedRef: marker.seedId,
              contentHash: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
              minimumWorldVersion: '0',
            },
            endpoints: {
              origin: 'https://current-test.example',
              projectionPath: '/v1/postwar-office-runtime',
              finalLookupPath: '/v1/final-receipt',
              deploymentRef: 'TEST_ONLY_CFC_MIXED_CURRENT',
            },
            currentIdentity: () => authority.identity,
            getAccessToken: async () => readback!.token().slice(7),
            session: {
              sessionRef: 'TEST_ONLY_CURRENT_SESSION',
              isCurrent: () => true,
              onInvalidate: () => () => undefined,
            },
          },
        });
        expect(browser.status).toBe('PAGE');
        expect(
          (await readback.read({ officeId: 'FINANCE', dataset: 'positions' }))
            .httpStatus,
        ).toBe(400);
        expect(
          (
            await readback.read({
              officeId: 'FINANCE',
              dataset: 'treasury-capacity',
              subject: '00000000-0000-4000-8000-999999999999',
            })
          ).httpStatus,
        ).toBe(403);
        await submit(fx('FX2', '3'));
        expect(
          (
            await readback.read({
              officeId: 'FINANCE',
              dataset: 'ledger-balances',
              offset: 1,
              limit: 1,
              sourceVersion: firstSource.sourceVersion,
              bindingVersion: firstSource.bindingVersion,
            })
          ).httpStatus,
        ).toBe(409);
        expect(
          (
            await readback.read({
              officeId: 'FINANCE',
              dataset: 'treasury-capacity',
            })
          ).httpStatus,
        ).toBe(503);
        await readback.publish();
        const refreshed = await readback.read({
          officeId: 'FINANCE',
          dataset: 'treasury-capacity',
        });
        expect(refreshed.httpStatus).toBe(200);
        expect(
          (refreshed.body.source as Record<string, unknown>).worldVersion,
        ).toBe('4');
        expect(
          (
            (refreshed.body.source as Record<string, unknown>)
              .currentFinancialCoverage as Record<string, unknown>
          ).financialPostingCount,
        ).toBe('12');
        await fixture.clone.installer.query(
          "insert into world_v2.postwar_office_projection_revocation(document_ref,world_id,reason_ref)select document_ref,world_id,'TEST_ONLY_CURRENT_REVOKED'from world_v2.postwar_office_projection_document where world_id=$1 and country_id=$2 and office_id='FINANCE'and dataset='opening-financial-legs'",
          [marker.worldId, marker.countryId],
        );
        expect(
          (
            await readback.read({
              officeId: 'FINANCE',
              dataset: 'treasury-capacity',
            })
          ).httpStatus,
        ).toBe(503);
        await expect(readback.publish()).rejects.toThrow();
        summary.status = 'PASS_TEST_ONLY';
        summary.head = { worldVersion: '4', eventSequence: '4' };
        summary.metrics = readback.metrics;
        summary.onlineQueries = readback.onlineQueries;
        expect(
          readback.onlineQueries.some((q) =>
            /canonical_payload|readValidatedLineage|opening_seed/iu.test(
              q.statement,
            ),
          ),
        ).toBe(false);
        summary.actualRows = {
          capacity,
          cb: cb.body.rows,
          socialFirstPageCount: socialRows.length,
        };
        summary.installed = readback.installed;
      } catch (error) {
        summary.status = 'FAIL_TEST_ONLY';
        summary.error = describeError(error);
        failure = error;
      } finally {
        const cleanup: unknown[] = [];
        try {
          await readback?.close();
        } catch (e) {
          cleanup.push(e);
        }
        const created = fixedRoles.filter((r) => !priorFixed.includes(r));
        try {
          await fixture.cleanup();
        } catch (e) {
          cleanup.push(e);
        }
        if (created.length) {
          const admin = new (await import('pg')).Pool({
            host: fixture.marker.socket,
            port: fixture.marker.port,
            database: 'postgres',
            user: 'postgres',
            password: async () => '',
            ssl: false,
            max: 1,
          });
          try {
            for (const role of [...created].reverse())
              await admin.query('drop role ' + role);
          } catch (e) {
            cleanup.push(e);
          } finally {
            await admin.end();
          }
        }
        summary.cleanupErrors = cleanup.map(String);
        summary.cleanup = cleanup.length === 0;
        await writeFile(
          evidence + '/readback-report.json',
          JSON.stringify(summary, null, 2) + '\n',
        );
        if (cleanup.length)
          failure = new AggregateError(
            failure ? [failure, ...cleanup] : cleanup,
            'MIXED_CURRENT_NATIVE_CLEANUP_FAILED',
            failure ? { cause: failure } : undefined,
          );
      }
      if (failure) throw failure;
    },
    180000,
  );
});
