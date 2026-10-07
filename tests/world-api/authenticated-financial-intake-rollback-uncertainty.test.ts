import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthenticatedFinancialIntakeComposition } from '../../apps/world-api/src/integration/authenticated-financial-intake-composition.js';
import { startGFinancialIntakeNativeCluster } from '../support/g-financial-intake-native-fixture.js';

const native = process.env.G_NATIVE_FINANCIAL_INTAKE === '1';
let cluster: Awaited<ReturnType<typeof startGFinancialIntakeNativeCluster>>;
beforeAll(async () => {
  if (native) cluster = await startGFinancialIntakeNativeCluster();
}, 30000);
afterAll(async () => {
  if (cluster) await cluster.close();
}, 30000);

describe.skipIf(!native)(
  'G-INTAKE-01 actual direct approval rollback acknowledgement classification',
  () => {
    for (const lostAck of [false, true])
      it.each([
        ['SIGN_SELLER', 'sellerTrade', 'narrow_transfer_approval_signature'],
        [
          'SIGN_BUYER_TRADE',
          'buyerTrade',
          'narrow_transfer_approval_signature',
        ],
        [
          'SIGN_BUYER_FINANCE',
          'buyerFinance',
          'narrow_transfer_approval_signature',
        ],
        [
          'BIND_REFERENCE',
          'buyerFinance',
          'narrow_transfer_approval_reference',
        ],
      ] as const)(
        `${lostAck ? 'lost' : 'acknowledged'} rollback for %s keeps exact transaction outcome`,
        async (action, seat, table) => {
          const f = await cluster.fixture();
          expect(
            (
              await f.call(
                f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
              )
            ).body.ok,
          ).toBe(true);
          const fingerprint = (await f.call(f.staged('INSPECT'))).body.state!
            .commandFingerprint as string;
          for (const [a, s] of [
            ['SIGN_SELLER', 'sellerTrade'],
            ['SIGN_BUYER_TRADE', 'buyerTrade'],
            ['SIGN_BUYER_FINANCE', 'buyerFinance'],
          ] as const) {
            if (a === action || action === 'SIGN_SELLER') break;
            expect(
              (
                await f.call(
                  f.staged(a, s, { commandFingerprint: fingerprint }),
                  s,
                )
              ).body.ok,
            ).toBe(true);
          }
          async function footprint() {
            return (
              await f.admin.query(`select
          (select count(*)::text from world_v2.narrow_transfer_proposal) as proposals,
          (select count(*)::text from world_v2.narrow_transfer_approval_signature) as signatures,
          (select count(*)::text from world_v2.narrow_transfer_approval_reference) as references,
          (select count(*)::text from world_v2.command_queue) as queued,
          (select count(*)::text from world_v2.command_receipt) as receipts,
          (select bool_and(active) from world_v2.current_commit_authorization) as active`)
            ).rows[0];
          }
          const before = await footprint();
          let writeStatements = 0,
            rollbackAttempted = false,
            destroyed = false;
          const wrapped = {
            async connect() {
              const client = await f.writer.connect();
              let wrote = false;
              return {
                query: async (sql: string, values?: unknown[]) => {
                  if (wrote && sql.endsWith(' for share of authz'))
                    await client.query(
                      'update world_v2.current_commit_authorization set active=false where auth_subject=$1',
                      [f.original.officeActors[seat].principal.authSubject],
                    );
                  const result = await client.query(sql, values);
                  if (sql.startsWith(`insert into world_v2.${table}`)) {
                    wrote = true;
                    writeStatements++;
                  }
                  if (wrote && sql === 'rollback') {
                    rollbackAttempted = true;
                    if (lostAck)
                      throw new Error(
                        'TEST_ONLY_ROLLBACK_ACKNOWLEDGEMENT_LOST',
                      );
                  }
                  return result;
                },
                release: (destroy?: boolean) => {
                  destroyed ||= destroy === true;
                  client.release(destroy);
                },
              };
            },
          } as unknown as Pick<Pool, 'connect'>;
          const request = f.staged(action, seat, {
            commandFingerprint: fingerprint,
          });
          const result = await createAuthenticatedFinancialIntakeComposition({
            ...f.config,
            writerPool: wrapped,
          }).handle({
            authorization: `Bearer ${f.token(seat)}`,
            request: f.envelope(request),
          });
          expect(rollbackAttempted).toBe(true);
          expect(writeStatements).toBe(1);
          if (lostAck) {
            expect(destroyed).toBe(true);
            expect(result).toMatchObject({
              httpStatus: 503,
              body: {
                ok: false,
                state: {
                  status: 'UNKNOWN',
                  action,
                  worldId: f.world,
                  commandId: request.commandId,
                  idempotencyKey: request.idempotencyKey,
                  retryable: true,
                },
              },
            });
            expect(result.body.error).toBeUndefined();
          } else
            expect(result).toMatchObject({
              httpStatus: 403,
              body: {
                ok: false,
                error: { code: 'AUTHORIZATION_DENIED', retryable: false },
              },
            });
          // Actual server rolled back, but lost acknowledgement cannot establish
          // that result to the API. This observer is test evidence, not a fallback
          // receipt or automatic transaction replay available to the caller.
          expect(await footprint()).toEqual(before);
          const retry = await f.call(request, seat);
          expect(retry.body.ok).toBe(true);
          expect(retry.body.state!.status).toBe(
            action === 'BIND_REFERENCE'
              ? 'REFERENCE_BOUND'
              : 'SIGNATURE_RECORDED',
          );
          expect(writeStatements).toBe(1);
        },
      );
  },
);
