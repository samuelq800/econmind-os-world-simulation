/** Opt-in actual isolated cached H6 clone. Uses the installed connection, not
 * a replacement request/facts/consumer implementation. No source preparation,
 * production credentials, schema/role installation, or Clock advancement. */
import { fork, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import { createPostwarMixedBudgetRuntimeFixture } from '../support/postwar-mixed-budget-runtime-fixture.js';

const optIn = process.env.ECONMIND_POSTWAR_FINANCE_CONNECTION_NATIVE;
if (optIn !== undefined && optIn !== '1')
  throw Error('EXPLICIT_FINANCE_CONNECTION_NATIVE_FLAG_REQUIRED');
const enabled = optIn === '1';
const native = enabled ? describe : describe.skip;
native(
  'explicit Finance connection installer / actual cached native H6',
  () => {
    it('queues and consumes Budget through the installed runtime, restores Final after child restart, and denies revoked source', async () => {
      const checkpoint = process.env.ECONMIND_POSTWAR_MIXED_H6_CHECKPOINT;
      if (
        !checkpoint ||
        !process.env.ECONMIND_POSTWAR_MIXED_CAPACITY_SOURCE_CHECKPOINT
      )
        throw Error(
          'SEALED_H6_AND_EXISTING_SMALL_SOURCE_TEMPLATE_REQUIRED_NO_REPREPARATION',
        );
      const f = await createPostwarMixedBudgetRuntimeFixture(checkpoint);
      const dir =
        '/workspace/.cloud-setup/evidence/postwar-finance-connection-native-20261029/standard-node-runtime';
      const evidence: Record<string, unknown> = {
        classification:
          'ACTUAL_STANDARD_NODE_CI_FINANCE_CONNECTION_NOT_DEPLOYED',
        seedFingerprint: f.marker.seedFingerprint,
        admissionRef: f.marker.admissionRef,
        sourceSHA256: f.sourceSHA256,
        WorldClock: false,
      };
      // The same throwaway in-memory JWT fixture pattern as the existing native
      // test. No signing key is persisted, printed or enrolled as release authority.
      const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
        project = 'abcdefghijklmnopqrst',
        issuer = 'https://' + project + '.supabase.co/auth/v1',
        jwksUrl = issuer + '/.well-known/jwks.json',
        ui = 'https://pages.example';
      const jwk = {
        ...keys.publicKey.export({ format: 'jwk' }),
        kid: 'TEST_ONLY_FINANCE_CONNECTION',
        alg: 'ES256',
        use: 'sig',
        key_ops: ['verify'],
      };
      const token = () => {
        const now = Math.floor(Date.now() / 1000),
          head = Buffer.from(
            JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
          ).toString('base64url'),
          body =
            head +
            '.' +
            Buffer.from(
              JSON.stringify({
                sub: f.marker.subject,
                iss: issuer,
                aud: 'authenticated',
                iat: now - 5,
                exp: now + 600,
              }),
            ).toString('base64url');
        return (
          body +
          '.' +
          sign('sha256', Buffer.from(body), {
            key: keys.privateKey,
            dsaEncoding: 'ieee-p1363',
          }).toString('base64url')
        );
      };
      let child: ChildProcess | undefined,
        base = '',
        complete = false;
      const hosts: Record<string, unknown>[] = [],
        pending = new Map<
          string,
          {
            resolve: (r: Record<string, unknown>) => void;
            reject: (e: Error) => void;
            timer: ReturnType<typeof setTimeout>;
          }
        >();
      const ask = (operation: string) =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const id = randomUUID(),
            timer = setTimeout(() => {
              pending.delete(id);
              reject(Error('OWNED_INSTALLER_IPC_DEADLINE'));
            }, 10000);
          pending.set(id, { resolve, reject, timer });
          child!.send({ operation, id });
        });
      async function close() {
        const own = child;
        if (!own) return;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error('OWNED_INSTALLER_CHILD_NOT_CLOSED')),
            10000,
          );
          own.once('exit', (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(Error('OWNED_INSTALLER_CHILD_EXIT_' + code));
          });
          own.send({ operation: 'close' });
        });
        child = undefined;
      }
      async function launch() {
        const own = fork(
          new URL(
            '../../tools/office-connection/native-budget-capacity-host.mjs',
            import.meta.url,
          ),
          [],
          {
            execPath: process.execPath,
            serialization: 'advanced',
            env: {
              NODE_ENV: 'test',
              ECONMIND_ENV: 'ci',
              ECONMIND_BUDGET_CAPACITY_TEST_HOST: '1',
              ECONMIND_BUDGET_CAPACITY_CONNECTION_INSTALLER: '1',
            },
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          },
        );
        child = own;
        const ready = new Promise<Record<string, unknown>>(
          (resolve, reject) => {
            const timer = setTimeout(
              () => reject(Error('OWNED_INSTALLER_LISTEN_DEADLINE')),
              10000,
            );
            own.on('message', (raw: Record<string, unknown>) => {
              if (raw.type === 'LISTENING_TEST_ONLY') {
                clearTimeout(timer);
                resolve(raw);
                return;
              }
              const p =
                typeof raw.id === 'string' ? pending.get(raw.id) : undefined;
              if (p) {
                clearTimeout(p.timer);
                pending.delete(String(raw.id));
                if (raw.type === 'ERROR') p.reject(Error(String(raw.message)));
                else p.resolve(raw.result as Record<string, unknown>);
              } else if (raw.type === 'ERROR') {
                clearTimeout(timer);
                reject(Error(String(raw.message)));
              }
            });
            own.once('error', (e) => {
              clearTimeout(timer);
              reject(e);
            });
          },
        );
        own.send({
          operation: 'start',
          config: {
            socket: f.marker.socket,
            port: f.marker.port,
            database: f.clone.database,
            workerRole: f.workerRole,
            intakeRole: f.intakeRole,
            readerRole: f.marker.roles.boundedReaderRole,
            authorizationPublisherRole:
              f.marker.roles.authorizationPublisherRole,
            workerId: f.workerId,
            subject: f.marker.subject,
            countryId: f.marker.countryId,
            sourceSHA256: f.sourceSHA256,
            historyMode: 'BUDGET_SOCIAL',
            pins: {
              worldId: f.marker.worldId,
              seedRef: f.marker.seedId,
              contentHash: f.marker.seedFingerprint,
              admissionRef: f.marker.admissionRef,
              minimumWorldVersion: '0',
            },
            projectRef: project,
            issuer,
            jwksUrl,
            jwk,
            ui,
            origin: 'https://read.example',
          },
        });
        const info = await ready;
        expect(info.connectionInstaller).toBe(
          'STANDARD_EXPLICIT_FINANCE_CONNECTION',
        );
        expect(info.nodeRuntime).toBe('STANDARD_NODE_API_RUNTIME');
        hosts.push(info);
        base = String(info.base);
      }
      const call = async (
        path: string,
        body: unknown,
        authenticated = true,
      ) => {
        const response = await fetch(base + path, {
          method: 'POST',
          headers: {
            origin: ui,
            'content-type': 'application/json',
            ...(authenticated ? { authorization: 'Bearer ' + token() } : {}),
          },
          body: JSON.stringify(body),
        });
        return {
          status: response.status,
          body: (await response.json()) as unknown,
        };
      };
      const request = {
        worldId: f.marker.worldId,
        countryId: f.marker.countryId,
        officeId: 'FINANCE',
        commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        commandId: 'COMMAND_FINANCE_CONNECTION_SET',
        idempotencyKey: 'KEY_FINANCE_CONNECTION_SET',
        expectedWorldVersion: '6',
        payload: {
          operation: 'SET_ENVELOPE',
          scope: {
            worldId: f.marker.worldId,
            countryId: f.marker.countryId,
            entityRef: f.policy.governmentEntityId,
            envelopeRef: f.policy.envelopeRef,
            effectivePeriodRef: f.policy.effectivePeriodRef,
          },
          currency: f.policy.currency,
          amount: '1',
          envelopeRevisionRef: 'REV_FINANCE_CONNECTION_SET',
          lineRef: null,
          revisionRef: 'REV_FINANCE_CONNECTION_SET',
          predecessorRevisionRef: null,
        },
      };
      const envelope = {
        schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
        requestId: randomUUID(),
        request,
      };
      const recovery = {
        schemaVersion: C.AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: randomUUID(),
        request: {
          worldId: f.marker.worldId,
          commandId: request.commandId,
          idempotencyKey: request.idempotencyKey,
          originalRequest: envelope,
        },
      };
      const cleanupErrors: string[] = [];
      try {
        await expect(
          f.worker.query(
            'select canonical_payload from world_v2.opening_seed where world_id=$1',
            [f.marker.worldId],
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await launch();
        expect((await call('/v1/office-command', envelope, false)).status).toBe(
          401,
        );
        const wrong = {
          ...envelope,
          requestId: randomUUID(),
          request: {
            ...request,
            countryId: 'COUNTRY_02',
            payload: {
              ...request.payload,
              scope: { ...request.payload.scope, countryId: 'COUNTRY_02' },
            },
          },
        };
        expect((await call('/v1/office-command', wrong)).status).toBe(403);
        const queued = await call('/v1/office-command', envelope);
        expect(
          queued.status,
          JSON.stringify({
            response: queued.body,
            source: await ask('inspect'),
          }),
        ).toBe(202);
        expect(await ask('consume')).toMatchObject({
          status: 'PROCESSED',
          source: 'NEW_FINAL',
          receipt: { outcome: 'COMMITTED', worldVersionAfter: '7' },
        });
        expect(
          (await call('/v1/command-recovery', recovery)).body,
        ).toMatchObject({
          ok: true,
          state: {
            status: 'FINAL',
            receipt: { outcome: 'COMMITTED', worldVersionAfter: '7' },
          },
        });
        const installed = await ask('inspect');
        expect(installed.nodeRuntime).toBe('STANDARD_NODE_API_RUNTIME');
        hosts.push(installed);
        await close();
        await launch();
        expect((await call('/v1/office-command', envelope)).body).toMatchObject(
          {
            ok: true,
            state: {
              status: 'FINALIZED',
              source: 'EXISTING',
              submitted: false,
            },
          },
        );
        expect(
          (await call('/v1/command-recovery', recovery)).body,
        ).toMatchObject({
          ok: true,
          state: {
            status: 'FINAL',
            receipt: { outcome: 'COMMITTED', worldVersionAfter: '7' },
          },
        });
        const head = await f.clone.installer.query(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
          [f.marker.worldId],
        );
        expect(head.rows).toEqual([
          { world_version: '7', event_sequence: '11' },
        ]);
        const writes = await f.clone.installer.query(
          "select(select count(*)from world_v2.authoritative_event where world_id=$1 and causation_command_id=$2)::text as events,(select count(*)from world_v2.command_receipt where world_id=$1 and command_id=$2 and outcome='COMMITTED')::text as receipts,(select count(*)from world_v2.financial_posting_batch where world_id=$1)::text as money",
          [f.marker.worldId, request.commandId],
        );
        expect(writes.rows).toEqual([
          { events: '1', receipts: '1', money: '0' },
        ]);
        await f.publisher.query(
          'select world_v2.revoke_finance_budget_policy($1,$2)',
          [f.policyRef, 'TEST_ONLY_FINANCE_CONNECTION_REVOKED'],
        );
        const revoked = {
          ...envelope,
          requestId: randomUUID(),
          request: {
            ...request,
            commandId: 'COMMAND_FINANCE_CONNECTION_REVOKED',
            idempotencyKey: 'KEY_FINANCE_CONNECTION_REVOKED',
            expectedWorldVersion: '7',
          },
        };
        expect((await call('/v1/office-command', revoked)).body).toMatchObject({
          ok: false,
          error: { code: 'SOURCE_RUNTIME_UNAVAILABLE' },
        });
        const rejected = await f.clone.installer.query(
          'select(select count(*)from world_v2.command_submission where world_id=$1 and command_id=$2)::text as commands,(select count(*)from world_v2.command_queue where world_id=$1 and command_id=$2)::text as queues',
          [f.marker.worldId, revoked.request.commandId],
        );
        expect(rejected.rows).toEqual([{ commands: '0', queues: '0' }]);
        hosts.push(await ask('inspect'));
        evidence.head = head.rows[0];
        evidence.effects = writes.rows[0];
        complete = true;
      } finally {
        try {
          await close();
        } catch (error) {
          cleanupErrors.push(
            error instanceof Error
              ? error.message
              : 'OWNED_CHILD_CLEANUP_FAILED',
          );
        }
        if (!child) {
          try {
            await f.cleanup();
          } catch (error) {
            cleanupErrors.push(
              error instanceof Error
                ? error.message
                : 'OWNED_CLONE_CLEANUP_FAILED',
            );
          }
        } else
          cleanupErrors.push(
            'OWNED_CLONE_RETAINED_BECAUSE_CHILD_NOT_CONFIRMED_CLOSED',
          );
        await mkdir(dir, { recursive: true });
        await writeFile(
          dir + '/summary.json',
          JSON.stringify(
            {
              ...evidence,
              hosts,
              complete,
              ownedCleanup: cleanupErrors.length === 0,
              cleanupErrors,
              productionDeployment: false,
            },
            null,
            2,
          ) + '\n',
        );
      }
      if (cleanupErrors.length)
        throw Error(
          'OWNED_INSTALLER_CLEANUP_UNCONFIRMED:' + cleanupErrors.join('|'),
        );
    }, 30000);
  },
);
