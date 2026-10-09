import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseConfigFileTextToJson } from 'typescript';
import { parseCanonicalCommand, type CanonicalCommand } from '@econmind/core';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { cIsolatedHash } from '../support/c-isolated-financial-fixture.js';
import { createOAuthenticatedFinancialRoundtripFixture } from '../support/o-authenticated-financial-roundtrip-fixture.js';
import type { V10FixtureActorKey } from '../support/v10-two-country-fixture.js';
import type { AuthenticatedFinancialIntakeResponseDto } from '@econmind/core';

// No production DSN input. This owns the existing macOS disposable PG fixture.
// Query caching/TLS/real Supabase publication are NOT proved by local Hyperdrive.
describe.skipIf(process.env.O_WORKERD_POSTGRES_ROUNDTRIP !== '1')(
  'TEST_ONLY actual workerd PostgreSQL command roundtrip',
  () => {
    it('verifies JWT/current seats, registers one immutable command, settles in workerd, reads FINAL and denies a revoked seat', async () => {
      const toolRoot = process.env.WORLD_CLOUDFLARE_TOOL_ROOT;
      if (!toolRoot || !isAbsolute(toolRoot))
        throw new Error('ISOLATED_CLOUDFLARE_TOOL_ROOT_REQUIRED');
      const tool = (name: string, file: string) =>
        resolve(toolRoot, 'node_modules', name, file);
      const pkg = JSON.parse(
        await readFile(tool('wrangler', 'package.json'), 'utf8'),
      );
      expect(pkg.version).toBe('4.148.0');
      const { Miniflare, convertV4MiniflareOptions } = await import(
        pathToFileURL(tool('miniflare', 'dist/src/index.js')).href
      );
      const f = await createOAuthenticatedFinancialRoundtripFixture();
      let mf: InstanceType<typeof Miniflare> | undefined;
      try {
        const jwks = await (await f.auth.fetch(f.auth.jwksUrl)).json();
        const config = {
          opening: f.c.hostInput.opening,
          workerId: f.c.hostInput.workerId,
          roles: f.roles,
          auth: {
            projectRef: f.auth.projectRef,
            expectedIssuer: f.auth.expectedIssuer,
            jwksUrl: f.auth.jwksUrl,
            audience: f.auth.audience,
          },
          jwks,
          actors: Object.fromEntries(
            Object.values(f.c.original.officeActors).map((a) => [
              a.principal.authSubject,
              a.actorId,
            ]),
          ),
        };
        const wrangler = tool('wrangler', 'bin/wrangler.js');
        const entry = resolve(
          'artifacts/world-runtime-postgres/test-only-entry.ts',
        );
        await writeFile(
          entry,
          `import { createCloudflarePostgresTestFixture } from '../../tests/support/cloudflare-postgres-workerd-fixture.js'; export default createCloudflarePostgresTestFixture(${JSON.stringify(config)});\n`,
        );
        const configPath =
          'tests/support/cloudflare-postgres-test.wrangler.jsonc';
        const parsedConfig = parseConfigFileTextToJson(
          configPath,
          await readFile(configPath, 'utf8'),
        );
        if (parsedConfig.error)
          throw new Error('TEST_ONLY_WRANGLER_CONFIG_INVALID');
        const wranglerConfig = parsedConfig.config;
        const runtimeConfig = resolve(
          'artifacts/world-runtime-postgres/test-only.wrangler.jsonc',
        );
        await writeFile(
          runtimeConfig,
          JSON.stringify({ ...wranglerConfig, main: entry }),
        );
        execFileSync(
          process.execPath,
          [
            wrangler,
            'deploy',
            '--dry-run',
            '--config',
            runtimeConfig,
            '--outdir',
            resolve('artifacts/world-runtime-postgres/bundle'),
          ],
          {
            env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
            stdio: 'pipe',
          },
        );
        const url = (user: string) =>
          `postgresql://${user}@127.0.0.1:${f.port}/econmind_v09_o_authenticated_roundtrip`;
        mf = new Miniflare(
          convertV4MiniflareOptions({
            host: '127.0.0.1',
            port: 0,
            workers: [
              {
                name: 'TEST_ONLY_PG',
                modules: true,
                scriptPath: resolve(
                  'artifacts/world-runtime-postgres/bundle/test-only-entry.js',
                ),
                compatibilityDate: '2026-10-09',
                compatibilityFlags: ['nodejs_compat'],
                hyperdrives: {
                  TEST_ONLY_READER: url(f.roles.reader),
                  TEST_ONLY_INTAKE: url(f.roles.writer),
                  TEST_ONLY_EXECUTOR: url('postgres'),
                },
              },
            ],
          }),
        );
        await mf.ready;
        const worker = await mf.getWorker('TEST_ONLY_PG');
        const call = async (
          path: string,
          request: unknown,
          seat: V10FixtureActorKey = 'sellerTrade',
        ) =>
          worker.fetch('https://test-only.invalid/test-only/' + path, {
            method: 'POST',
            headers: { authorization: 'Bearer ' + f.token(seat) },
            body: JSON.stringify(request),
          });
        const intake = async (
          request: unknown,
          seat: V10FixtureActorKey = 'sellerTrade',
        ) => {
          const response = await call(
            'intake',
            {
              request: {
                schemaVersion: 'world-authenticated-financial-intake-v1',
                requestId: '33333333-3333-4333-8333-333333333333',
                request,
              },
            },
            seat,
          );
          return {
            status: response.status,
            body: (await response.json()) as AuthenticatedFinancialIntakeResponseDto,
          };
        };
        const wrongSeat = await intake(
          f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
          'buyerTrade',
        );
        expect(wrongSeat.body.ok).toBe(false);
        const registered = await intake(
          f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
        );
        expect(registered).toMatchObject({
          status: 200,
          body: { ok: true, state: { status: 'PENDING_APPROVAL_OR_ENQUEUE' } },
        });
        const fingerprint = (await intake(f.staged('INSPECT'))).body.state
          ?.commandFingerprint;
        expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
        for (const [action, seat] of [
          ['SIGN_SELLER', 'sellerTrade'],
          ['SIGN_BUYER_TRADE', 'buyerTrade'],
          ['SIGN_BUYER_FINANCE', 'buyerFinance'],
        ] as const)
          expect(
            (
              await intake(
                f.staged(action, seat, { commandFingerprint: fingerprint }),
                seat,
              )
            ).body.ok,
          ).toBe(true);
        const ref = await intake(
          f.staged('BIND_REFERENCE', 'buyerFinance', {
            commandFingerprint: fingerprint,
          }),
          'buyerFinance',
        );
        expect(ref.body.ok).toBe(true);
        const enqueue = f.staged('ENQUEUE', 'sellerTrade', {
          commandFingerprint: fingerprint,
          approvalRef: ref.body.state?.approvalRef,
        });
        for (let n = 0; n < 2; n++)
          expect((await intake(enqueue)).body.state?.status).toBe('QUEUED');
        const transfer = await f.database.transaction((tx) =>
          new DurableV08LedgerLineageReader({
            database: f.database,
            sha256Hex: cIsolatedHash,
          }).readCommandFrom(tx, f.c.world, f.commandId),
        );
        const consume = async (simTime: string) => {
          const response = await call('consume', { simTime });
          expect(response.status).toBe(200);
          return (await response.json()) as {
            step: {
              status: string;
              receipt?: { outcome: string; worldVersionAfter: string };
            };
            worldVersion: string;
            financial: Array<{
              accountId: string;
              balance: { amount: string; currency: string };
            }>;
            inventory: Array<{
              countryId: string;
              quantity: { amount: string; unit: string };
            }>;
          };
        };
        expect((await consume('10000')).step).toMatchObject({
          status: 'PROCESSED',
          receipt: { outcome: 'COMMITTED', worldVersionAfter: '1' },
        });
        function automatic(kind: 'SHIP' | 'DELIVERY'): CanonicalCommand {
          const destination = f.c.original.inventoryAccounts.buyerAvailable;
          return parseCanonicalCommand(
            {
              schemaVersion: transfer.schemaVersion,
              commandId: `COMMAND_WORKERD_${kind}`,
              idempotencyKey: `KEY_WORKERD_${kind}`,
              worldId: transfer.worldId,
              commandType:
                kind === 'SHIP'
                  ? 'CORE_GOODS_SHIPMENT_V1'
                  : 'CORE_GOODS_DELIVERY_V1',
              actorId: transfer.actorId,
              authSubject: transfer.authSubject,
              countryId: transfer.countryId,
              officeId: null,
              expectedWorldVersion: kind === 'SHIP' ? '1' : '2',
              simTime: kind === 'SHIP' ? '10100' : '10200',
              submittedAtReal: transfer.submittedAtReal,
              correlationId: transfer.correlationId,
              payload:
                kind === 'SHIP'
                  ? {
                      schemaVersion: 'core-goods-shipment-v1',
                      shipmentId: 'SHIPMENT_WORKERD',
                      transferCommandId: transfer.commandId,
                      transferFingerprint: transfer.fingerprint,
                    }
                  : {
                      schemaVersion: 'core-goods-delivery-v1',
                      shipmentId: 'SHIPMENT_WORKERD',
                      transferCommandId: transfer.commandId,
                      transferFingerprint: transfer.fingerprint,
                      destination: {
                        physicalLocationId: destination.physicalLocationId,
                        titleHolderId: destination.titleHolderId,
                        riskBearerId: destination.riskBearerId,
                        economicRecognitionId:
                          destination.economicRecognitionId,
                      },
                      buyerTreasuryAccountId:
                        f.c.original.financialAccounts.buyerTreasury.accountId,
                      sellerSettlementAccountId:
                        f.c.original.financialAccounts.sellerSettlement
                          .accountId,
                    },
            },
            cIsolatedHash,
          );
        }
        await f.c.schedule(automatic('SHIP'));
        expect((await consume('10100')).worldVersion).toBe('2');
        await f.c.schedule(automatic('DELIVERY'));
        const delivered = await consume('10200');
        expect(delivered.step).toMatchObject({
          status: 'PROCESSED',
          receipt: { outcome: 'COMMITTED', worldVersionAfter: '3' },
        });
        expect(
          delivered.financial.find(
            (p) =>
              p.accountId ===
              f.c.original.financialAccounts.buyerTreasury.accountId,
          )?.balance,
        ).toEqual({ amount: '2', currency: 'GCU' });
        expect(
          delivered.financial.find(
            (p) =>
              p.accountId ===
              f.c.original.financialAccounts.sellerSettlement.accountId,
          )?.balance,
        ).toEqual({ amount: '8', currency: 'GCU' });
        expect(
          delivered.inventory.find(
            (p) => p.countryId === f.c.original.countries.buyer,
          )?.quantity,
        ).toEqual({ amount: '2', unit: 'tonne' });
        expect((await consume('10200')).step).toEqual({ status: 'IDLE' });
        expect(
          (
            await f.admin.query(
              'select count(*)::text as commands from world_v2.command_submission where world_id=$1',
              [f.c.world],
            )
          ).rows[0],
        ).toEqual({ commands: '3' });
        await f.publish('3');
        const final = async () =>
          (
            await call('final', {
              request: {
                schemaVersion: 'world-final-receipt-read-v1',
                requestId: '55555555-5555-4555-8555-555555555555',
                operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
                payload: {
                  worldId: f.c.world,
                  commandId: f.commandId,
                  idempotencyKey: f.idempotencyKey,
                },
              },
            })
          ).json();
        expect(await final()).toMatchObject({
          ok: true,
          result: {
            ok: true,
            receipt: {
              outcome: 'COMMITTED',
              commandId: f.commandId,
              commandFingerprint: fingerprint,
            },
          },
        });
        expect((await intake(f.staged('READ'))).body.state?.status).toBe(
          'FINAL',
        );
        await f.admin.query(
          'update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2',
          [
            f.c.world,
            f.c.original.officeActors.sellerTrade.principal.authSubject,
          ],
        );
        expect(await final()).toMatchObject({ ok: false });
        expect((await intake(f.staged('READ'))).body.ok).toBe(false);
        console.info(
          'WORKERD_PG_MECHANISM_PASS',
          JSON.stringify({
            production: false,
            worldVersion: '3',
            commands: '3',
            receipts: '3',
            mutationHost: 'workerd',
            nativePostgres: true,
            localHyperdrive: true,
          }),
        );
      } finally {
        await mf?.dispose();
        await f.c.host.stop();
        await f.close();
      }
    }, 60000);
  },
);
