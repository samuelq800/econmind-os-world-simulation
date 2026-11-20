/** Actual opt-in TCP/SQL acceptance, not production activation or Clock use.
 * A new empty-history clone adopts the real 70-point policy; no sealed World
 * is reset. The same finite consumer processes Budget -> FX -> Captain. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  parsePostwarCaptainPoliticalCapitalRow,
  parsePostwarCaptainCurrentCoverage,
} from '@econmind/core/postwar-captain-current-contract';
import {
  createPostwarOfficeNodeBootstrapCaptainNativeFixture,
  verifyPostwarCaptainReleaseNativeContract,
} from '../support/postwar-office-node-bootstrap-captain-native-fixture.js';
const enabled = process.env.ECONMIND_POSTWAR_OFFICE_NODE_CAPTAIN_NATIVE === '1';
const evidence =
  '/workspace/.cloud-setup/evidence/fx-cfc-office-node-captain-native-20261030';
const root = path.resolve(import.meta.dirname, '../..');
function errorTree(v: unknown, depth = 0): unknown {
  if (!(v instanceof Error) || depth >= 12) return String(v);
  return {
    name: v.name,
    message: v.message,
    stack: v.stack,
    code: 'code' in v ? v.code : undefined,
    actual: 'actual' in v ? v.actual : undefined,
    expected: 'expected' in v ? v.expected : undefined,
    cause: v.cause === undefined ? undefined : errorTree(v.cause, depth + 1),
    errors:
      v instanceof AggregateError
        ? v.errors.map((e: unknown) => errorTree(e, depth + 1))
        : undefined,
  };
}
function closedPort(port: number) {
  return new Promise<string>((resolve, reject) => {
    const s = createConnection({ host: '127.0.0.1', port });
    s.setTimeout(1000, () => {
      s.destroy();
      reject(Error('CLOSED_PORT_PROBE_TIMEOUT'));
    });
    s.once('connect', () => {
      s.destroy();
      reject(Error('LISTENER_STILL_OPEN'));
    });
    s.once('error', (e: NodeJS.ErrnoException) => {
      s.destroy();
      if (e.code === 'ECONNREFUSED') resolve(e.code);
      else reject(e);
    });
  });
}
describe('adopted Captain in the one genuine office Node bootstrap', () => {
  it.skipIf(!enabled)(
    'consumes Budget/FX/Captain once, auto-publishes current pages over TCP and drains all owned transports',
    async () => {
      await mkdir(evidence, { recursive: true });
      const report: Record<string, unknown> = {
        classification:
          'ACTUAL_ADOPTED_POLICY_NEW_ISOLATED_TEST_SCENARIO_NOT_PRODUCTION',
        status: 'IN_PROGRESS',
        worldRebootstrap: false,
        worldClock: false,
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
      };
      const inputs = [
        'tests/support/postwar-office-node-bootstrap-captain-native-fixture.ts',
        'tests/world-api/postwar-office-node-bootstrap-captain-native.test.ts',
        'apps/world-api/src/runtime/postwar-office-node-bootstrap.ts',
        'apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.ts',
      ];
      const hashes = async () =>
        Object.fromEntries(
          await Promise.all(
            inputs.map(async (n) => [
              n,
              createHash('sha256')
                .update(await readFile(path.join(root, n)))
                .digest('hex'),
            ]),
          ),
        );
      report.inputHashesBefore = await hashes();
      const save = async (stage: string) => {
        report.stage = stage;
        await writeFile(
          path.join(evidence, 'report.json'),
          JSON.stringify(
            report,
            (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
            2,
          ) + '\n',
        );
      };
      let f:
        | Awaited<
            ReturnType<
              typeof createPostwarOfficeNodeBootstrapCaptainNativeFixture
            >
          >
        | undefined;
      let failure: unknown,
        failed = false;
      const cleanupErrors: unknown[] = [];
      try {
        await save('OWNED_H0_CLONE_ADOPT_SEVENTY_PREPARE_BEFORE_LISTEN');
        f =
          await createPostwarOfficeNodeBootstrapCaptainNativeFixture(evidence);
        const { host } = f;
        report.opening = f.opening;
        report.installedSQL = f.installed;
        report.startupMs = f.startupMs;
        report.startupMeasurementScope =
          'READBACK_FIXTURE_DERIVATION_PLUS_NEW_BOOTSTRAP_PREPARATION_NOT_PRODUCTION_RAM';
        expect(f.opening.publicationCount).toBe(70);
        expect(host.ready()).toBe(true);
        expect(await f.counts()).toEqual(f.initial);
        const seats = await f.call('/v1/current-seat', {
          schemaVersion: C.AUTHENTICATED_CURRENT_SEAT_SCHEMA,
          requestId: randomUUID(),
        });
        expect(seats).toMatchObject({ status: 200, body: { ok: true } });
        expect(seats.body.bindings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              identity: expect.objectContaining({ officeId: 'CAPTAIN' }),
            }),
          ]),
        );
        host.consumer.startPreparation();
        const committed: unknown[] = [];
        report.committed = committed;
        for (const [i, envelope] of f.envelopes.entries()) {
          await save(
            'REAL_JWT_HTTP_QUEUE_AND_SAME_CONSUMER_STEP_' + String(i + 1),
          );
          const queued = await f.call('/v1/office-command', envelope);
          report.lastHTTP = queued;
          expect(queued).toMatchObject({
            status: 202,
            body: { ok: true, state: { status: 'QUEUED' } },
          });
          const step = await host.consumer.consumeOnce();
          report.lastStep = step;
          expect(step).toMatchObject({
            status: 'PROCESSED',
            source: 'NEW_FINAL',
            receipt: { outcome: 'COMMITTED' },
            derivedPublication: {
              status: 'PUBLISHED',
              countryId: 'COUNTRY_01',
              documentCount: 13,
              captain: 'PUBLISHED',
              head: {
                worldVersion: String(i + 1),
                eventSequence: String(i + 1),
              },
            },
          });
          if (step.status !== 'PROCESSED')
            throw Error('ACTUAL_FINAL_RECEIPT_REQUIRED');
          committed.push({
            commandId: step.commandId,
            source: step.source,
            outcome: step.receipt.outcome,
            derivedPublication: step.derivedPublication,
          });
          expect((await f.counts()).version).toBe(String(i + 1));
          if (i === 1) {
            const origin0 = await f.page(
              'CAPTAIN',
              'political-capital-current',
            );
            report.originZeroAtActualH2 = origin0;
            await save('ACTUAL_TCP_CAPTAIN_ORIGIN_ZERO_AT_H2');
            expect(origin0).toMatchObject({
              status: 200,
              body: {
                source: {
                  worldVersion: '2',
                  eventSequence: '2',
                  currentCaptainCoverage: {
                    originWorldVersion: '0',
                    originEventSequence: '0',
                    globalWorldVersion: '2',
                    globalEventSequence: '2',
                  },
                },
              },
            });
            const rows = (origin0.body.rows as unknown[]).map(
              parsePostwarCaptainPoliticalCapitalRow,
            );
            expect(rows).toHaveLength(7);
            expect(rows.map((r) => r.balance)).toEqual(Array(7).fill('10'));
          }
        }
        report.committed = committed;
        const h3 = await f.counts();
        expect(h3).toMatchObject({
          version: '3',
          sequence: '3',
          commands: '3',
          receipts: '3',
          events: '3',
          batches: '2',
          inventory: '0',
          queues: '3',
        });
        report.h3 = h3;
        await save('ACTUAL_TCP_CURRENT_PAGES_FINAL_AND_IDEMPOTENT_RETRY');
        const captain = await f.page('CAPTAIN', 'political-capital-current');
        report.captain = captain;
        await save('ACTUAL_TCP_CAPTAIN_CURRENT_H3');
        expect(captain).toMatchObject({
          status: 200,
          body: {
            source: {
              dataNature: 'ADMITTED_CURRENT_POLITICAL_CAPITAL_MIXED_PREFIX',
              worldVersion: '3',
              eventSequence: '3',
            },
          },
        });
        const source = captain.body.source as Record<string, unknown>,
          coverage = parsePostwarCaptainCurrentCoverage(
            source.currentCaptainCoverage,
          );
        expect(coverage).toMatchObject({
          originWorldVersion: '3',
          originEventSequence: '3',
          globalWorldVersion: '3',
          globalEventSequence: '3',
          financialBatchCount: '2',
        });
        const capital = (captain.body.rows as unknown[]).map(
          parsePostwarCaptainPoliticalCapitalRow,
        );
        expect(capital).toHaveLength(7);
        expect(capital.map((r) => r.balance)).toEqual([
          '7.25',
          '12.75',
          '10',
          '10',
          '10',
          '10',
          '10',
        ]);
        for (const r of capital)
          expect(r).toMatchObject({
            opening: '70',
            total: '70',
            available: '70',
            closing: '70',
            generated: '0',
            spent: '0',
          });

        for (const [office, dataset] of [
          ['FINANCE', 'treasury-capacity'],
          ['CENTRAL_BANK', 'ledger-balances'],
          ['SOCIAL', 'positions'],
        ]) {
          const page = await f.page(office!, dataset!);
          expect(page).toMatchObject({
            status: 200,
            body: { source: { worldVersion: '3', eventSequence: '3' } },
          });
        }
        for (const envelope of f.envelopes) {
          expect(
            await f.call('/v1/command-recovery', {
              schemaVersion: 'world-command-recovery-v1',
              requestId: randomUUID(),
              request: {
                worldId: envelope.request.worldId,
                commandId: envelope.request.commandId,
                idempotencyKey: envelope.request.idempotencyKey,
                originalRequest: envelope,
              },
            }),
          ).toMatchObject({
            status: 200,
            body: {
              ok: true,
              state: { status: 'FINAL', receipt: { outcome: 'COMMITTED' } },
            },
          });
          expect(await f.call('/v1/office-command', envelope)).toMatchObject({
            status: 200,
            body: {
              ok: true,
              state: {
                status: 'FINALIZED',
                source: 'EXISTING',
                submitted: false,
              },
            },
          });
        }
        const cap = f.envelopes[2]!;
        expect(
          (
            await f.call('/v1/office-command', {
              ...cap,
              requestId: randomUUID(),
              request: {
                ...cap.request,
                countryId: 'COUNTRY_02',
                commandId: cap.request.commandId + '_CROSS',
                idempotencyKey: cap.request.idempotencyKey + '_CROSS',
                expectedWorldVersion: '3',
              },
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await f.call(
              '/v1/current-seat',
              {
                schemaVersion: C.AUTHENTICATED_CURRENT_SEAT_SCHEMA,
                requestId: randomUUID(),
              },
              '00000000-0000-4000-8000-999999999999',
            )
          ).status,
        ).toBe(503);
        expect(await f.counts()).toEqual(h3);
        const retried = await host.retryDerivedPublication(
          cap.request.commandId,
        );
        expect(retried).toMatchObject({
          status: 'PUBLISHED',
          documentCount: 13,
          head: { worldVersion: '3', eventSequence: '3' },
        });
        expect(await f.counts()).toEqual(h3);
        report.idempotentDerivedRetry = retried;
        report.metrics = f.metrics;
        expect(
          f.metrics
            .filter((m) => m.route !== '/v1/office-command')
            .every((m) => m.bytes <= 65536),
        ).toBe(true);
        await save('ACTUAL_SHUTDOWN_JOIN_PUBLICATION_CLOSE_LISTENER_AND_POOLS');
        const stopping = host.shutdown();
        expect(host.shutdown()).toBe(stopping);
        await stopping;
        expect(await closedPort(host.port)).toBe('ECONNREFUSED');
        expect(host.ready()).toBe(false);
        for (const pool of [
          f.fixture.worker,
          f.fixture.intakePool,
          f.fixture.readPool,
          f.fixture.sourcePool,
        ]) {
          expect(pool.totalCount).toBe(0);
          expect(pool.idleCount).toBe(0);
        }
        expect(await f.counts()).toEqual(h3);
        report.status = 'PASSED';
      } catch (e) {
        failed = true;
        failure = e;
        report.status = 'FAILED';
        report.error = errorTree(e);
        report.databaseErrors = f?.fixture.databaseErrors;
        report.metrics = f?.metrics;
        try {
          report.actualCountsAtFailure = await f?.counts();
        } catch (countError) {
          report.countReadbackError = errorTree(countError);
        }
      } finally {
        try {
          report.cleanup = await f?.cleanup();
          if (f)
            expect(report.cleanup).toMatchObject({
              owned_clone_exists: false,
              owned_roles: '0',
              owned_sessions: '0',
              sealed_baseline_preserved: true,
            });
        } catch (e) {
          cleanupErrors.push(e);
          report.cleanupError = errorTree(e);
        }
        report.inputHashesAfter = await hashes();
        expect(report.inputHashesAfter).toEqual(report.inputHashesBefore);
        await save(cleanupErrors.length ? 'FAILED_CLEANUP' : 'COMPLETED');
      }
      if (cleanupErrors.length)
        throw new AggregateError(
          [...(failed ? [failure] : []), ...cleanupErrors],
          'CAPTAIN_NODE_NATIVE_FAILED_OR_CLEANUP_FAILED',
        );
      if (failed) throw failure;
    },
    300000,
  );
});

// Separate opt-in: no full fixture, startup preparation, seed parse or consumer.
describe('minimal actual Captain release-role SQL contract', () => {
  it.skipIf(
    process.env.ECONMIND_POSTWAR_CAPTAIN_RELEASE_CONTRACT_NATIVE !== '1',
  )(
    'executes baseline RLS scope,70 exact publications,recovery and precise denials',
    async () => {
      const out =
        '/workspace/.cloud-setup/evidence/fx-cfc-office-node-captain-native-20261030/release-contract';
      await mkdir(out, { recursive: true });
      try {
        const report = await verifyPostwarCaptainReleaseNativeContract();
        expect(report.status).toBe('PASSED');
        expect(report.cleanup).toMatchObject({
          owned_clone_exists: false,
          owned_sessions: '0',
          sealed_baseline_preserved: true,
        });
        await writeFile(
          path.join(out, 'report.json'),
          JSON.stringify(report, null, 2) + '\n',
        );
      } catch (error) {
        await writeFile(
          path.join(out, 'report.json'),
          JSON.stringify(
            {
              status: 'FAILED',
              error: errorTree(error),
              contract:
                error &&
                typeof error === 'object' &&
                'releaseContractReport' in error
                  ? error.releaseContractReport
                  : undefined,
            },
            null,
            2,
          ) + '\n',
        );
        throw error;
      }
    },
    60000,
  );
});
